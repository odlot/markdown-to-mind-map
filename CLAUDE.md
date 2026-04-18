# CLAUDE.md

## Tests

```
npm test                        # run all fixtures
node test/run.js basic          # run a single fixture
VERBOSE=1 npm test              # dump actual graph on failure
```

Tests load `extension.js` under a stubbed `vscode` module (`test/vscode-shim.js`) and call `buildGraph` against a fixture directory. `buildGraph` is not exported — the runner wraps the source and re-exports it. The shim reads its workspace root from `VSCODE_SHIM_ROOT`, which `test/run.js` sets per fixture.

## Adding a fixture

1. Create `test/fixtures/<name>/` with `.md` files.
2. Add a matching entry to the `expectations` map in `test/run.js` listing every expected node (`id`, `label`, `level`) and every expected link (`kind`, `source`, `target`).
3. Extra nodes or links not in the expectation set are treated as failures — keep expectations exhaustive.

## Architecture notes

Node IDs use the breadcrumb format `<relpath>::<H1>>.<H2>>.<H3>`, with `::__root__` for the file root. The root's label is the first `#` heading if present, else the filename. Links in `buildGraph`'s output carry `kind: 'containment' | 'link'` — the webview uses this to style edges (dashed vs solid) and tune force distances.
