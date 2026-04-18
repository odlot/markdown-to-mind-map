// Runs buildGraph against each fixture and asserts expected nodes / links.
// Usage: node test/run.js           (runs all)
//        node test/run.js basic     (runs just one fixture)
//        VERBOSE=1 node test/run.js (prints full graph on failure)
const fs = require('fs');
const path = require('path');
const Module = require('module');

const repoRoot = path.resolve(__dirname, '..');
const fixturesDir = path.join(__dirname, 'fixtures');
const only = process.argv[2];

// Redirect `require('vscode')` to our shim.
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...a) {
  if (req === 'vscode') return path.join(__dirname, 'vscode-shim.js');
  return origResolve.call(this, req, ...a);
};

// Load extension.js and expose buildGraph (it's not on module.exports).
function loadBuildGraph() {
  const src = fs.readFileSync(path.join(repoRoot, 'extension.js'), 'utf8');
  const wrapped = src + '\nmodule.exports.buildGraph = buildGraph;\n';
  const m = { exports: {} };
  const fn = new Function('require', 'module', 'exports', '__dirname', '__filename', wrapped);
  fn(require, m, m.exports, repoRoot, path.join(repoRoot, 'extension.js'));
  return m.exports.buildGraph;
}

const expectations = {
  basic: {
    nodes: [
      { id: 'InformationA.md::__root__', label: 'InformationA', level: 1 },
      { id: 'InformationA.md::InformationA>SubheadingA of InformationA', label: 'SubheadingA of InformationA', level: 2 },
      { id: 'InformationA.md::InformationA>SubheadingB of InformationA', label: 'SubheadingB of InformationA', level: 2 },
      { id: 'InformationD.md::__root__', label: 'InformationD', level: 1 },
    ],
    links: [
      { kind: 'containment', source: 'InformationA.md::__root__', target: 'InformationA.md::InformationA>SubheadingA of InformationA' },
      { kind: 'containment', source: 'InformationA.md::__root__', target: 'InformationA.md::InformationA>SubheadingB of InformationA' },
      { kind: 'link', source: 'InformationD.md::__root__', target: 'InformationA.md::InformationA>SubheadingA of InformationA' },
    ],
  },
  'link-edges': {
    nodes: [
      { id: 'a.md::__root__', label: 'File A', level: 1 },
      { id: 'a.md::File A>Section One', label: 'Section One', level: 2 },
      { id: 'a.md::File A>Section Two', label: 'Section Two', level: 2 },
      { id: 'a.md::File A>Section Three', label: 'Section Three', level: 2 },
      { id: "a.md::File A>What's Next?", label: "What's Next?", level: 2 },
      { id: 'a.md::File A>FAQ & Tips', label: 'FAQ & Tips', level: 2 },
      { id: 'a.md::File A>Has: Colons', label: 'Has: Colons', level: 2 },
      { id: 'b.md::__root__', label: 'File B', level: 1 },
    ],
    links: [
      // containment edges for every heading
      { kind: 'containment', source: 'a.md::__root__', target: 'a.md::File A>Section One' },
      { kind: 'containment', source: 'a.md::__root__', target: 'a.md::File A>Section Two' },
      { kind: 'containment', source: 'a.md::__root__', target: 'a.md::File A>Section Three' },
      { kind: 'containment', source: 'a.md::__root__', target: "a.md::File A>What's Next?" },
      { kind: 'containment', source: 'a.md::__root__', target: 'a.md::File A>FAQ & Tips' },
      { kind: 'containment', source: 'a.md::__root__', target: 'a.md::File A>Has: Colons' },
      // in-file pure #slug md-link
      { kind: 'link', source: 'a.md::File A>Section One', target: 'a.md::File A>Section Two' },
      // in-file pure [[#Heading]] wikilink
      { kind: 'link', source: 'a.md::File A>Section One', target: 'a.md::File A>Section Three' },
      // cross-file slug form
      { kind: 'link', source: 'b.md::__root__', target: "a.md::File A>What's Next?" },
      // cross-file punctuated wikilinks (raw-text match)
      { kind: 'link', source: 'b.md::__root__', target: 'a.md::File A>FAQ & Tips' },
      { kind: 'link', source: 'b.md::__root__', target: 'a.md::File A>Has: Colons' },
      { kind: 'link', source: 'b.md::__root__', target: 'a.md::File A>Section Two' },
    ],
  },
};

async function runFixture(name) {
  const fixturePath = path.join(fixturesDir, name);
  process.env.VSCODE_SHIM_ROOT = fixturePath;
  // Re-load so fresh shim root is picked up (vscode-shim reads env at require time).
  delete require.cache[path.join(__dirname, 'vscode-shim.js')];
  const buildGraph = loadBuildGraph();
  const graph = await buildGraph();
  const expected = expectations[name];
  if (!expected) {
    console.error(`no expectations for fixture "${name}"`);
    return false;
  }
  const failures = [];

  // Nodes: assert each expected node exists with matching label+level.
  for (const e of expected.nodes) {
    const got = graph.nodes.find(n => n.id === e.id);
    if (!got) failures.push(`missing node: ${e.id}`);
    else {
      if (got.label !== e.label) failures.push(`node ${e.id}: label "${got.label}" != "${e.label}"`);
      if (got.level !== e.level) failures.push(`node ${e.id}: level ${got.level} != ${e.level}`);
    }
  }
  // Extra nodes (ids not in expected) are a failure.
  const expectedIds = new Set(expected.nodes.map(n => n.id));
  for (const n of graph.nodes) {
    if (!expectedIds.has(n.id)) failures.push(`unexpected node: ${n.id}`);
  }

  // Links: compare as set of "kind|source|target".
  const keyOf = l => `${l.kind}|${l.source}|${l.target}`;
  const expectedKeys = new Set(expected.links.map(keyOf));
  const actualKeys = new Set(graph.links.map(keyOf));
  for (const k of expectedKeys) if (!actualKeys.has(k)) failures.push(`missing link: ${k}`);
  for (const k of actualKeys) if (!expectedKeys.has(k)) failures.push(`unexpected link: ${k}`);

  if (failures.length === 0) {
    console.log(`PASS  ${name}  (${graph.nodes.length} nodes, ${graph.links.length} links)`);
    return true;
  }
  console.log(`FAIL  ${name}`);
  for (const f of failures) console.log('      ' + f);
  if (process.env.VERBOSE) {
    console.log('--- actual nodes ---');
    for (const n of graph.nodes) console.log('  ', n.id, '|', n.label, 'L' + n.level);
    console.log('--- actual links ---');
    for (const l of graph.links) console.log('  ', keyOf(l));
  }
  return false;
}

(async () => {
  const names = only ? [only] : Object.keys(expectations);
  let ok = true;
  for (const name of names) {
    const pass = await runFixture(name);
    if (!pass) ok = false;
  }
  process.exit(ok ? 0 : 1);
})();
