// Minimal `vscode` stub so extension.js's buildGraph can run under plain node.
// The fixture root is read from the VSCODE_SHIM_ROOT env var.
const fs = require('fs');
const path = require('path');

const root = process.env.VSCODE_SHIM_ROOT;
if (!root) throw new Error('VSCODE_SHIM_ROOT must be set');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push({ fsPath: p });
  }
  return out;
}

module.exports = {
  workspace: {
    workspaceFolders: [{ uri: { fsPath: root } }],
    findFiles: async () => walk(root),
    createFileSystemWatcher: () => ({
      onDidChange() {}, onDidCreate() {}, onDidDelete() {},
    }),
  },
  commands: { registerCommand: () => ({}) },
  window: {},
  ViewColumn: { One: 1, Beside: 2 },
};
