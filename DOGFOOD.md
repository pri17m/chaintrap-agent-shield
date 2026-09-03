# Dogfood — Chaintrap Agent Shield

Use this before Marketplace publish. No API key required.

## 1. Run the Extension Development Host

1. Open `chaintrap-agent-shield` in VS Code or Cursor.
2. `npm install` then `npm test` (expect a clean pass).
3. Press **F5** (launch config: *Run Extension*).
4. In the new window, **File → Open Folder** and choose `fixtures/dogfood`.

## 2. Phase A — baseline

On folder open you should see:

- Status bar: `Chaintrap: scanning workspace…` then `baseline complete`
- A **critical** modal for `nx@20.9.0` and/or `@postman/postman-mcp-cli@1.0.4`
- Agent Activity tree groups **Baseline (already installed)** vs **Delta**
- Problems panel entries from the `chaintrap` collection

Acknowledge with **I understand the risk**. Findings stay visible but are marked acknowledged.

## 3. Phase B — delta

In the dogfood folder, add a dependency (for example `"left-pad": "1.3.0"`) to `package.json` and wait ~3 seconds.

- Only the new/changed package should be analyzed
- Activity tree should tag it `delta`
- Command **Chaintrap: Review agent changes since last session** lists delta findings only

## 4. Offline fallback

Disable network (or block `api.osv.dev`) and rescan.

- Known-bad packages still go critical
- Unknown packages show *Could not verify online* (not a silent pass)

## 5. Install the VSIX locally

```bash
npm run package
code --install-extension chaintrap-agent-shield-0.1.0.vsix
```

Cursor: install from VSIX in the Extensions view.

## 6. Marketplace publish (publisher `pri17m`)

Create a Personal Access Token at https://marketplace.visualstudio.com/manage with **Marketplace** scope, then:

```bash
npx @vscode/vsce login pri17m
npx @vscode/vsce publish
```

Or non-interactive:

```bash
npx @vscode/vsce publish --pat %VSCE_PAT%
```
