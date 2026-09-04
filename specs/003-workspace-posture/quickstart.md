# Quickstart: Workspace Posture Insight

1. `npm test` in repo root (includes posture rollup and `.vscode/mcp.json` inventory).
2. `npm run compile` then Launch Extension against a folder that has `package.json` without a lockfile and/or `.vscode/mcp.json`.
3. Open the Chaintrap activity bar: **Workspace posture** is the first view.
4. Status bar should not read `Chaintrap: ready`. Clicking it focuses Workspace posture.
5. **Chaintrap: Review agent changes since last session** still lists delta findings.
6. Package: `npm run package` → `chaintrap-agent-shield-0.1.24.vsix`.
