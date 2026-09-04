# Contract: Workspace posture rollup

Pure function. No VS Code API, no filesystem, no network.

```ts
buildPosture(findings: Finding[], summary: InventorySummary): PostureModel
summarizeInventory(items: InventoryItem[], hasOpenFolder: boolean): InventorySummary
```

## Status-bar priority (first match)

1. `summary.scanning` → `Chaintrap: scanning workspace…`
2. malicious package-like count > 0 → `Chaintrap: {n} malicious`
3. unacked critical > 0 → `Chaintrap: {n} critical`
4. unacked high (remaining ackable) > 0 → `Chaintrap: {n} high`
5. actionable coverage gaps (coverage notes + unpinned MCP + unverified-online that are not unpinned) > 0 → `Chaintrap: {n} coverage gap(s)`
6. packagesChecked === 0 → `Chaintrap: workspace clear`
7. else → `Chaintrap: {n} packages checked`

Idle text MUST NOT be `Chaintrap: ready`.

## Attention rows (omit when count is 0)

- Malicious packages — command focuses Dependencies
- Malicious MCP servers — command focuses MCP servers
- Vulnerable packages / MCP
- Unacknowledged high/critical

Group expanded when any attention row exists.

## Coverage rows

- No lockfile — direct pins only (count of `coverageNote` findings); command opens first coverage path when present
- Unpinned MCP servers
- Could not verify online (unverifiedOnline and not unpinned)
- Skills/rules inventoried, not analyzed — only if skills + rules > 0; **not** included in status-bar gap count

## Checked rows (after a completed scan, not scanning/empty placeholder)

- npm pins (N), PyPI pins (N), MCP servers (N), Skills inventoried (N), Rules inventoried (N)
- Workspace MCP: `.vscode/mcp.json` and/or `.cursor/mcp.json` when `workspaceMcpSources` is non-empty

## Placeholders

- scanning → `Scan in progress…`
- !hasOpenFolder && no inventory counts → `No open folder`
- hasOpenFolder && all counts zero → `Nothing inventoried yet`
