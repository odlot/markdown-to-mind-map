# markdown-to-mind-map

Convert a Markdown document into a mind map by transforming links into graph edges and documents into nodes.

## Visualization

The visualization relies on [D3](https://d3js.org) and implements a [disjoint force-directed graph](https://observablehq.com/@d3/disjoint-force-directed-graph/2) to prevent unlinked Markdown documents to escape the user's viewport.
