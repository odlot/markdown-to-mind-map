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
  integration: {
    nodes: [
      { id: 'Index.md::__root__', label: 'Index', level: 1 },
      { id: 'InformationA.md::__root__', label: 'InformationA', level: 1 },
      { id: 'InformationA.md::InformationA>SubheadingA of InformationA', label: 'SubheadingA of InformationA', level: 2 },
      { id: 'InformationA.md::InformationA>SubheadingB of InformationA', label: 'SubheadingB of InformationA', level: 2 },
      { id: 'InformationA.md::InformationA>SubheadingC of InformationA', label: 'SubheadingC of InformationA', level: 2 },
      { id: 'InformationAB.md::__root__', label: 'InformationAB', level: 1 },
      { id: 'InformationB.md::__root__', label: 'Information B', level: 1 },
      { id: 'InformationB.md::Information B>Subheading of Information B', label: 'Subheading of Information B', level: 2 },
      { id: 'InformationC.md::__root__', label: 'InformationC', level: 1 },
      { id: 'InformationD.md::__root__', label: 'InformationD', level: 1 },
      { id: 'InformationD.md::InformationD>SubheadingA of InformationD', label: 'SubheadingA of InformationD', level: 2 },
      { id: 'InformationD.md::InformationD>SubheadingB of InformationD', label: 'SubheadingB of InformationD', level: 2 },
    ],
    links: [
      { kind: 'containment', source: 'InformationA.md::__root__', target: 'InformationA.md::InformationA>SubheadingA of InformationA' },
      { kind: 'containment', source: 'InformationA.md::__root__', target: 'InformationA.md::InformationA>SubheadingB of InformationA' },
      { kind: 'containment', source: 'InformationA.md::__root__', target: 'InformationA.md::InformationA>SubheadingC of InformationA' },
      { kind: 'containment', source: 'InformationB.md::__root__', target: 'InformationB.md::Information B>Subheading of Information B' },
      { kind: 'containment', source: 'InformationD.md::__root__', target: 'InformationD.md::InformationD>SubheadingA of InformationD' },
      { kind: 'containment', source: 'InformationD.md::__root__', target: 'InformationD.md::InformationD>SubheadingB of InformationD' },
      { kind: 'link', source: 'Index.md::__root__', target: 'InformationA.md::__root__' },
      { kind: 'link', source: 'Index.md::__root__', target: 'InformationB.md::__root__' },
      { kind: 'link', source: 'Index.md::__root__', target: 'InformationC.md::__root__' },
      { kind: 'link', source: 'InformationA.md::__root__', target: 'InformationAB.md::__root__' },
      { kind: 'link', source: 'InformationA.md::InformationA>SubheadingA of InformationA', target: 'InformationD.md::InformationD>SubheadingA of InformationD' },
      { kind: 'link', source: 'InformationD.md::InformationD>SubheadingB of InformationD', target: 'InformationA.md::InformationA>SubheadingA of InformationA' },
    ],
  },
  'with-pdf': {
    // Linked PDFs appear as attachment nodes (rendered as rectangles in the
    // webview). Multiple links to the same PDF dedup to a single edge.
    nodes: [
      { id: 'doc.md::__root__', label: 'Doc', level: 1 },
      { id: 'sample.pdf', label: 'sample', level: 1, kind: 'attachment' },
    ],
    links: [
      { kind: 'link', source: 'doc.md::__root__', target: 'sample.pdf' },
    ],
  },
  cycles: {
    nodes: [
      { id: 'alpha.md::__root__', label: 'Alpha', level: 1 },
      { id: 'beta.md::__root__', label: 'Beta', level: 1 },
      { id: 'x.md::__root__', label: 'X', level: 1 },
      { id: 'y.md::__root__', label: 'Y', level: 1 },
      { id: 'z.md::__root__', label: 'Z', level: 1 },
      { id: 'self.md::__root__', label: 'Self', level: 1 },
      { id: 'self.md::Self>Topic', label: 'Topic', level: 2 },
      { id: 'within.md::__root__', label: 'Within', level: 1 },
      { id: 'within.md::Within>Left', label: 'Left', level: 2 },
      { id: 'within.md::Within>Right', label: 'Right', level: 2 },
    ],
    links: [
      // containment
      { kind: 'containment', source: 'self.md::__root__', target: 'self.md::Self>Topic' },
      { kind: 'containment', source: 'within.md::__root__', target: 'within.md::Within>Left' },
      { kind: 'containment', source: 'within.md::__root__', target: 'within.md::Within>Right' },
      // two-file cycle: both edges must exist independently
      { kind: 'link', source: 'alpha.md::__root__', target: 'beta.md::__root__' },
      { kind: 'link', source: 'beta.md::__root__', target: 'alpha.md::__root__' },
      // three-file cycle
      { kind: 'link', source: 'x.md::__root__', target: 'y.md::__root__' },
      { kind: 'link', source: 'y.md::__root__', target: 'z.md::__root__' },
      { kind: 'link', source: 'z.md::__root__', target: 'x.md::__root__' },
      // within-file cycle between two sub-headings
      { kind: 'link', source: 'within.md::Within>Left', target: 'within.md::Within>Right' },
      { kind: 'link', source: 'within.md::Within>Right', target: 'within.md::Within>Left' },
      // self.md's self-targeting link must NOT appear — no entry here
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
      if (e.kind && got.kind !== e.kind) failures.push(`node ${e.id}: kind "${got.kind}" != "${e.kind}"`);
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
