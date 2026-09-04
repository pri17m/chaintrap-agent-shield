# Research: Workspace Posture Insight

## Decision: Derived posture, not a second scan

**Rationale**: Inventory and `analyzeItems` already produce findings and item lists. A pure `buildPosture(findings, summary)` keeps host cost at zero extra I/O and zero extra OSV, matching constitution II–III.

**Alternatives considered**: Re-walk the workspace for “coverage”; rejected (duplicate I/O). Webview dashboard; rejected (heavier, not native). 0–100 score; rejected (marketplace policy and false precision).

## Decision: Native tree view as the first activity-bar view

**Rationale**: VS Code TreeView is already the product surface. Placing `chaintrap.posture` first makes posture the default insight without a new container.

**Alternatives considered**: Welcome/walkthrough page; status-bar-only; webview panel. Tree is enough for three groups and click-through to existing views.

## Decision: Status-bar priority matches posture, idle is not “ready”

**Rationale**: `Chaintrap: ready` implied a clean workspace after ack even when malicious pins remained. Malicious count is independent of ack; unacked high/critical keep the existing ack contract; lockfile/unpinned/unverified are “coverage gaps”; otherwise show packages checked or workspace clear.

**Alternatives considered**: Keep “ready” after ack; rejected because it hides remaining malware pins. Include skills-not-analyzed in the gap count; rejected because heuristics are intentionally off.

## Decision: Unpinned vs unverified are distinct gaps

**Rationale**: Unpinned MCP findings currently set `unverifiedOnline`. Coverage-gap totals must count them once as unpinned, and count other `unverifiedOnline` (OSV unreachable) separately.

## Decision: Parse workspace `.vscode/mcp.json`

**Rationale**: VS Code stores workspace MCP at `.vscode/mcp.json`. Inventory today only reads `.cursor/mcp.json` in the folder, so VS Code-first posture would under-report MCP. Same `parseMcpFile` path; one extra `existsSync` + parse. Watch `**/.vscode/mcp.json`.

**Alternatives considered**: Defer to a later scanner slice; rejected because posture would be wrong for VS Code workspaces in this release.
