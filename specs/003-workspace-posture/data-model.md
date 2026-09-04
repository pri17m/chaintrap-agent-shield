# Data Model: Workspace Posture Insight

## InventorySummary (ephemeral)

Built from the current scan’s `InventoryItem[]`. Never persisted.

| Field | Notes |
|-------|-------|
| npmPins | `kind === "package"` and `ecosystem === "npm"` |
| pypiPins | `kind === "package"` and `ecosystem === "pypi"` |
| mcpServers | `kind === "mcp"` |
| skills | `kind === "skill"` |
| rules | `kind === "rule"` |
| workspaceMcpSources | `"vscode"` if a workspace item path ends with `.vscode/mcp.json`; `"cursor"` for `.cursor/mcp.json` |
| hasOpenFolder | at least one workspace folder |
| scanning | true only while a baseline is running |

`packagesChecked` = npmPins + pypiPins + mcpServers (same as today’s baseline package count).

## PostureRow

| Field | Notes |
|-------|-------|
| id | stable string for the row kind |
| group | `attention` \| `coverage` \| `checked` |
| label | includes count where applicable |
| count | 0 hides most rows; Checked count rows still show 0 |
| command | optional: focus Dependencies, focus MCP, or open a coverage file |

## PostureModel

| Field | Notes |
|-------|-------|
| scanning | placeholder tree when true |
| groups | Attention, Coverage, Checked (omitted for empty/scanning placeholders) |
| placeholder | optional single row for scanning / no folder / nothing inventoried |
| statusText | status-bar string |
| statusTooltip | one-line breakdown |
| attentionBadge | unacknowledged high+critical count (existing ack contract) |

## Finding (unchanged)

Posture reads `malicious`, `coverageNote`, `unverifiedOnline`, `acknowledged`, `severity`, `surface`, `packageName`, `version`, `path`. No new Finding fields.

## State

No new `globalState` keys. `ShieldController` holds the last `InventorySummary` in memory.
