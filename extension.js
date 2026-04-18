const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

let panel = null;

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('markdown-to-mindmap.open', () => openMindmap())
  );

  const watcher = vscode.workspace.createFileSystemWatcher('**/*.md');
  const refresh = () => { if (panel) openMindmap(); };
  watcher.onDidChange(refresh);
  watcher.onDidCreate(refresh);
  watcher.onDidDelete(refresh);
  context.subscriptions.push(watcher);
}

async function openMindmap() {
  const graph = await buildGraph();

  if (!panel) {
    panel = vscode.window.createWebviewPanel(
      'markdown-to-mindmap',
      'Markdown to mind map',
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );
    panel.onDidDispose(() => { panel = null; });
    panel.webview.onDidReceiveMessage(async msg => {
      if (msg.command === 'openFile') {
        const doc = await vscode.workspace.openTextDocument(msg.path);
        const line = Number.isInteger(msg.line) ? Math.max(0, msg.line) : 0;
        const pos = new vscode.Position(line, 0);
        const range = new vscode.Range(pos, pos);
        await vscode.window.showTextDocument(doc, {
          viewColumn: vscode.ViewColumn.One,
          selection: range,
        });
      }
    });
  }

  panel.webview.html = getWebviewContent(graph);
  panel.reveal(vscode.ViewColumn.Beside, true);
}

async function buildGraph() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return { nodes: [], links: [] };

  const root = workspaceFolders[0].uri.fsPath;
  const mdFiles = await vscode.workspace.findFiles('**/*.md', '{**/node_modules/**,**/.git/**}');

  const nodes = [];
  const links = [];
  const fileMap = {};
  const fileInfos = [];

  for (const uri of mdFiles) {
    const fullPath = uri.fsPath;
    const rel = path.relative(root, fullPath).replace(/\\/g, '/');
    const name = path.basename(fullPath, '.md');

    fileMap[name.toLowerCase()] = rel;
    fileMap[rel.toLowerCase()] = rel;
    fileMap[rel.toLowerCase().replace(/\.md$/, '')] = rel;

    let content = '';
    try { content = fs.readFileSync(fullPath, 'utf8'); } catch {}
    fileInfos.push({ fullPath, rel, name, content });
  }

  // Build heading-aware node tree per file and index headings for link resolution.
  // headingIndex: rel -> { rootId, byHeading: Map<lowerText, nodeId> }
  const headingIndex = {};

  for (const info of fileInfos) {
    const { fullPath, rel, name, content } = info;
    const parsed = parseFileNodes(content, rel, name, fullPath);
    nodes.push(...parsed.nodes);
    links.push(...parsed.containmentLinks);
    headingIndex[rel] = { rootId: parsed.rootId, byHeading: parsed.byHeading };
    info.lineOwners = parsed.lineOwners; // node id owning each line
    info.rootId = parsed.rootId;
  }

  // Resolve explicit links, attributed to the deepest heading owning the link's line.
  for (const info of fileInfos) {
    const { content, lineOwners, rel } = info;
    const lines = content.split(/\r?\n/);
    const wikiRe = /\[\[([^\]]+)\]\]/g;
    const mdLinkRe = /\[([^\]]+)\]\(([^)]+)\)/g;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const ownerId = lineOwners[i];
      if (!ownerId) continue;

      let m;
      wikiRe.lastIndex = 0;
      while ((m = wikiRe.exec(line)) !== null) {
        const inner = m[1].split('|')[0].trim();
        const [targetFile, targetHeading] = splitHash(inner);
        const resolved = resolveHeadingLink(targetFile, targetHeading, info.fullPath, fileMap, root, headingIndex, rel);
        if (resolved && resolved !== ownerId) links.push({ source: ownerId, target: resolved, kind: 'link' });
      }

      mdLinkRe.lastIndex = 0;
      while ((m = mdLinkRe.exec(line)) !== null) {
        const href = m[2].trim();
        if (!href || href.startsWith('http') || href.startsWith('mailto')) continue;
        const [targetFile, targetHeading] = splitHash(href);
        const resolved = resolveHeadingLink(targetFile, targetHeading, info.fullPath, fileMap, root, headingIndex, rel);
        if (resolved && resolved !== ownerId) links.push({ source: ownerId, target: resolved, kind: 'link' });
      }
    }
  }

  const seen = new Set();
  const uniqueLinks = links.filter(l => {
    const key = `${l.source}→${l.target}→${l.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const degree = {};
  uniqueLinks.forEach(l => {
    degree[l.source] = (degree[l.source] || 0) + 1;
    degree[l.target] = (degree[l.target] || 0) + 1;
  });
  nodes.forEach(n => { n.degree = degree[n.id] || 0; });

  return { nodes, links: uniqueLinks };
}

function parseFileNodes(content, rel, name, fullPath) {
  const lines = content.split(/\r?\n/);
  const nodes = [];
  const containmentLinks = [];
  const byHeading = new Map(); // lowercase heading text -> node id (first occurrence wins for link targets)
  const lineOwners = new Array(lines.length).fill(null);

  // Detect the first H1 to decide whether file root uses filename or first H1 text.
  let firstH1Index = -1;
  let firstH1Text = null;
  // Precompute heading info, respecting fenced code blocks.
  const headingInfos = []; // { line, level, text }
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const level = m[1].length;
    if (level > 3) continue; // H4+ not visualized
    headingInfos.push({ line: i, level, text: m[2].trim() });
    if (level === 1 && firstH1Index === -1) { firstH1Index = i; firstH1Text = m[2].trim(); }
  }

  // Root node: first H1 text if present, else filename.
  const rootLabel = firstH1Text !== null ? firstH1Text : name;
  const rootId = rel + '::__root__';
  nodes.push({
    id: rootId,
    label: rootLabel,
    level: 1,
    kind: 'heading',
    path: fullPath,
    file: rel,
    line: firstH1Index >= 0 ? firstH1Index : 0,
  });

  // Walk headings, skipping the first H1 (already the root).
  // Path stack: index by level (1..3) -> nodeId of most recent ancestor at that level.
  const stack = { 1: rootId, 2: null, 3: null };
  // Breadcrumb labels for unique-by-path IDs.
  const labelStack = { 1: rootLabel, 2: null, 3: null };
  let firstH1Skipped = false;

  for (const h of headingInfos) {
    if (h.level === 1 && !firstH1Skipped) {
      // This is the H1 that became the root. Register its heading text.
      registerHeading(byHeading, h.text, rootId);
      firstH1Skipped = true;
      continue;
    }

    if (h.level === 1) {
      // Additional H1 after the first: treat as a second top-level concept under root.
      // (Rare; we attach to root to avoid orphaning.)
      const id = `${rel}::${labelStack[1]}>${h.text}`;
      nodes.push({
        id, label: h.text, level: 1, kind: 'heading', path: fullPath, file: rel, line: h.line,
      });
      containmentLinks.push({ source: rootId, target: id, kind: 'containment' });
      registerHeading(byHeading, h.text, id);
      stack[2] = null; stack[3] = null;
      labelStack[2] = null; labelStack[3] = null;
      continue;
    }

    // Determine parent: deepest ancestor at a shallower level.
    let parentId;
    if (h.level === 2) parentId = stack[1];
    else /* level 3 */ parentId = stack[2] || stack[1];

    // Build breadcrumb path for unique ID.
    const crumbs = [labelStack[1]];
    if (h.level === 3 && labelStack[2]) crumbs.push(labelStack[2]);
    crumbs.push(h.text);
    const id = `${rel}::${crumbs.join('>')}`;

    nodes.push({
      id, label: h.text, level: h.level, kind: 'heading',
      path: fullPath, file: rel, line: h.line,
    });
    containmentLinks.push({ source: parentId, target: id, kind: 'containment' });
    registerHeading(byHeading, h.text, id);

    if (h.level === 2) {
      stack[2] = id; stack[3] = null;
      labelStack[2] = h.text; labelStack[3] = null;
    } else {
      stack[3] = id;
      labelStack[3] = h.text;
    }
  }

  // Assign owning node to each line: deepest heading currently in scope.
  let owner = rootId;
  let fenceOpen = false;
  const headingAtLine = new Map();
  for (const h of headingInfos) headingAtLine.set(h.line, h);

  const stackForOwners = { 1: rootId, 2: null, 3: null };
  let h1RootConsumed = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) fenceOpen = !fenceOpen;
    const h = headingAtLine.get(i);
    if (h && !fenceOpen) {
      if (h.level === 1 && !h1RootConsumed) {
        owner = rootId;
        stackForOwners[2] = null; stackForOwners[3] = null;
        h1RootConsumed = true;
      } else if (h.level === 1) {
        // Locate the node we added for this duplicate H1.
        const id = `${rel}::${rootLabel}>${h.text}`;
        stackForOwners[1] = id; stackForOwners[2] = null; stackForOwners[3] = null;
        owner = id;
      } else {
        // Rebuild crumbs as above.
        const crumbs = [rootLabel];
        if (h.level === 3) {
          // Need most recent H2 under current H1 from stackForOwners; reconstruct label via node lookup.
          const h2Id = stackForOwners[2];
          const h2Node = h2Id ? nodes.find(n => n.id === h2Id) : null;
          if (h2Node) crumbs.push(h2Node.label);
        }
        crumbs.push(h.text);
        const id = `${rel}::${crumbs.join('>')}`;
        if (h.level === 2) { stackForOwners[2] = id; stackForOwners[3] = null; }
        else stackForOwners[3] = id;
        owner = id;
      }
    }
    lineOwners[i] = owner;
  }

  return { nodes, containmentLinks, rootId, byHeading, lineOwners };
}

function splitHash(href) {
  const idx = href.indexOf('#');
  if (idx === -1) return [href, null];
  return [href.slice(0, idx), href.slice(idx + 1)];
}

function resolveHeadingLink(targetFile, targetHeading, fromFile, fileMap, root, headingIndex, currentRel) {
  let relTarget;
  if (!targetFile) {
    // Pure #heading link within current file.
    relTarget = currentRel;
  } else {
    relTarget = resolveFileToRel(targetFile, fromFile, fileMap, root);
  }
  if (!relTarget) return null;

  const idx = headingIndex[relTarget];
  if (!idx) return null;

  if (targetHeading) {
    const decoded = safeDecode(targetHeading);
    const raw = decoded.toLowerCase().trim();
    const hit =
      idx.byHeading.get(raw) ||
      idx.byHeading.get(slugifyHeading(decoded)) ||
      idx.byHeading.get(slugifyHeading(targetHeading));
    if (hit) return hit;
  }
  return idx.rootId;
}

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

function slugifyHeading(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

function registerHeading(map, text, id) {
  const raw = text.toLowerCase().trim();
  if (!map.has(raw)) map.set(raw, id);
  const slug = slugifyHeading(text);
  if (slug && !map.has(slug)) map.set(slug, id);
}

function resolveFileToRel(target, fromFile, fileMap, root) {
  const fromDir = path.dirname(fromFile);
  const candidates = [
    target.toLowerCase().replace(/\.md$/, ''),
    target.toLowerCase(),
    path.relative(root, path.join(fromDir, target)).replace(/\\/g, '/').toLowerCase().replace(/\.md$/, ''),
    path.relative(root, path.join(fromDir, target + '.md')).replace(/\\/g, '/').toLowerCase().replace(/\.md$/, ''),
  ];
  for (const c of candidates) {
    if (fileMap[c]) return fileMap[c];
    if (fileMap[c + '.md']) return fileMap[c + '.md'];
  }
  return null;
}

function getWebviewContent(graph) {
  const template = fs.readFileSync(path.join(__dirname, 'webview.html'), 'utf8');
  return template.replace('/*GRAPH_DATA*/null', JSON.stringify(graph));
}

function deactivate() {}

module.exports = { activate, deactivate };
