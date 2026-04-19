# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-04-19

### Added

- Interactive D3 force-directed graph of the markdown workspace, opened via
  the `Markdown to mind map: Open Graph` command or `Cmd/Ctrl+Shift+M`.
- Heading-aware node tree per file. Each file contributes a root node — the
  first `#` heading if present, otherwise the filename — plus nested `##`
  and `###` nodes. `####` and deeper are not graphed.
- Dashed containment edges link each heading to its parent; orphan `##` /
  `###` before any `#` attach to the filename root.
- Link edges (solid, arrowheaded) for both `[[wiki]]` and `[text](path.md)`
  forms. Sub-heading targets resolve via `#slug` (GitHub-style) or raw
  `#Heading` text, with `decodeURIComponent` applied so `%20`-encoded
  anchors work. Links are attributed to the deepest heading whose body
  contains them.
- PDF attachment support: a markdown link to a PDF materializes a
  rectangular node. Node label uses the link text (md `[label](x.pdf)` or
  wiki `[[x.pdf|label]]`), falling back to the filename for bare
  `[[x.pdf]]`. Clicking a PDF node opens it in VS Code's default viewer.
- Per-level visual hierarchy: node size, fill opacity, and label font size
  decrease from H1 to H3. Labels reveal progressively with zoom; hovering
  any node forces labels for itself and its neighbors regardless of zoom.
- Asymmetric hover colors separate outbound from inbound edges.
- Click a heading node to open the file and jump to that heading's line.
- Theme-aware rendering: colors inherit from the active VS Code theme and
  re-read on theme changes.
- Auto-refresh: the graph rebuilds when markdown files change, are created,
  or are deleted in the workspace.
- Node-based test harness (`npm test`) with fixtures under `test/fixtures/`
  covering basic linking, heading-anchor resolution edge cases, cycles,
  PDF attachments, and a larger integration scenario.

[Unreleased]: https://github.com/odlot/markdown-to-mind-map/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/odlot/markdown-to-mind-map/releases/tag/v0.1.0
