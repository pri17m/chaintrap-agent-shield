# Feature Specification: Workspace Posture Insight

**Feature Branch**: `003-workspace-posture`

**Created**: 2026-09-04

**Status**: Active

**Input**: Add a lightweight Workspace Posture tree and a clearer status-bar sentence so operators see workspace security posture at a glance. Derive insight from the existing inventory and findings. No new scanners, no 0–100 score, no webview. Parse workspace `.vscode/mcp.json` so VS Code MCP configs are visible.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See workspace posture without reconstructing it (Priority: P1)

As a developer who just opened a folder in VS Code, I want a Workspace posture tree at the top of the Chaintrap activity bar that rolls up attention, coverage gaps, and what was checked, so I do not have to reconstruct risk from two finding lists.

**Why this priority**: The product already classifies packages and MCP servers; the gap is insight, not more detection.

**Independent Test**: Given a fixture workspace with mixed findings (malicious package, unpinned MCP, no lockfile), `buildPosture` returns three groups with the expected row counts; empty and scanning states return a single placeholder row.

**Acceptance Scenarios**:

1. **Given** display findings that include malicious packages, vulnerable pins, unpinned MCP, coverage notes, and unverified online items, **When** posture is built, **Then** Attention needed lists malicious packages, malicious MCP, vulnerable packages/MCP, and unacknowledged high/critical; Coverage gaps lists lockfile, unpinned MCP, and unverified; Checked lists npm, PyPI, MCP, skills, and rules counts from inventory.
2. **Given** no open folder and no inventory items, **When** posture is built, **Then** the tree shows a single “No open folder” row.
3. **Given** an open folder with nothing inventoried, **When** posture is built, **Then** the tree shows “Nothing inventoried yet”.
4. **Given** a scan in progress, **When** posture is built, **Then** the tree shows “Scan in progress…” and does not show stale group counts as current.

---

### User Story 2 - Status bar matches posture priority (Priority: P1)

As an operator glancing at the status bar, I want a sentence that follows the same priority as the posture tree (scanning, then malicious, then unacked high/critical, then coverage gaps, then packages checked), and clicking it should reveal Workspace posture.

**Why this priority**: The status bar is the always-visible surface; “ready” hides remaining malicious pins and coverage gaps.

**Independent Test**: Unit tests assert status-bar text for scanning, malicious, unacked high/critical, coverage-only, packages-checked, and empty inventory.

**Acceptance Scenarios**:

1. **Given** unacknowledged malicious findings, **When** the status bar updates, **Then** it shows `N malicious` even if some other findings are only high/vulnerable.
2. **Given** no malicious findings but unacknowledged critical or high findings, **When** the status bar updates, **Then** it shows `N critical` or `N high` using the existing ack contract.
3. **Given** no attention findings but lockfile, unpinned, or unverified gaps, **When** the status bar updates, **Then** it shows `N coverage gap(s)`.
4. **Given** packages or MCP pins were checked and there is no attention and no actionable coverage gap, **When** the status bar updates, **Then** it shows `N packages checked` (not `ready` and not a post-baseline flash of skill counts).
5. **Given** no packages or MCP pins, **When** idle, **Then** it shows `workspace clear`.
6. **Given** the operator clicks the status bar, **When** the command runs, **Then** the Chaintrap activity bar opens on Workspace posture. Review agent changes remains a separate command.

---

### User Story 3 - Honest coverage, including VS Code MCP (Priority: P2)

As a VS Code user, I want posture to tell me what was actually checked — including workspace `.vscode/mcp.json` — and to say when skills/rules were inventoried but not analyzed.

**Why this priority**: VS Code workspace MCP is currently invisible; skill heuristics stay off and must not be implied as findings.

**Independent Test**: Inventory of a temp folder with `.vscode/mcp.json` yields MCP items; posture Checked group notes `.vscode/mcp.json` vs `.cursor/mcp.json`; skills/rules counts appear under coverage as “inventoried, not analyzed” and do not count as status-bar coverage gaps.

**Acceptance Scenarios**:

1. **Given** a workspace `.vscode/mcp.json` with an inferred package, **When** inventory runs, **Then** that server is inventoried the same way as `.cursor/mcp.json`.
2. **Given** workspace MCP from `.vscode/mcp.json` and/or `.cursor/mcp.json`, **When** posture is built, **Then** Checked notes which workspace MCP path(s) were used.
3. **Given** inventoried skills or rules, **When** posture is built, **Then** Coverage gaps includes “Skills/rules inventoried, not analyzed (N)” and that N does not increment the status-bar coverage-gap count.

---

### Edge Cases

- Unpinned MCP findings also set `unverifiedOnline`; they must not double-count as both unpinned and unverified in the coverage-gap total.
- Acknowledged high/critical findings drop from the unacked row and from high/critical status text; remaining malicious pins still appear under Attention and can still drive `N malicious`.
- User-level MCP (no open folder) still contributes to Checked counts when present.
- Delta scans must not start a second filesystem walk for posture; they reuse live inventory already collected for the delta.
- No numeric 0–100 score is computed or displayed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Chaintrap activity bar MUST show **Workspace posture** as the first view, above Dependencies and MCP servers.
- **FR-002**: Posture MUST be derived only from in-memory display findings plus the inventory item list from the current scan (no extra disk reads, no extra OSV or Chaintrap API calls).
- **FR-003**: Posture MUST group rows into Attention needed, Coverage gaps, and Checked this workspace as specified in the user stories.
- **FR-004**: Attention rows for malicious packages and malicious MCP MUST focus the existing Dependencies or MCP servers view.
- **FR-005**: Status-bar text MUST follow the priority in User Story 2; tooltip MUST be a one-line breakdown (malicious, vulnerable, gaps, checked).
- **FR-006**: Status-bar click MUST reveal Workspace posture; **Chaintrap: Review agent changes since last session** MUST remain available.
- **FR-007**: Workspace inventory MUST parse `.vscode/mcp.json` with the existing MCP parser in addition to `.cursor/mcp.json`.
- **FR-008**: File watchers MUST include workspace `.vscode/mcp.json` so MCP edits schedule a delta.
- **FR-009**: Posture MUST NOT persist new `globalState` keys; it is ephemeral UI.
- **FR-010**: Skill/rule heuristics MUST remain disabled; posture may only report that those files were inventoried.
- **FR-011**: The extension MUST NOT display a numeric security score.

### Key Entities

- **InventorySummary**: Counts of npm pins, PyPI pins, MCP servers, skills, rules; workspace MCP path kinds (vscode vs cursor); whether a folder is open; scanning flag.
- **PostureModel**: Groups, rows, status-bar text, tooltip, attention badge count.
- **Finding**: Unchanged schema; posture reuses existing flags (`malicious`, `coverageNote`, `unverifiedOnline`, ack, severity).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a baseline, an operator can answer “what is wrong, what is incomplete, and what was checked” from the posture tree without opening Dependencies or MCP servers first.
- **SC-002**: Status bar never idles on `Chaintrap: ready` after this release; idle text is `workspace clear` or `N packages checked`.
- **SC-003**: `npm test` passes, including posture rollup, empty/scanning, unpinned vs unverified, and `.vscode/mcp.json` inventory.
- **SC-004**: Patch 0.1.24 documents the slice in CHANGELOG; README Operation mentions Workspace posture.
- **SC-005**: A workspace with only `.vscode/mcp.json` (no `.cursor/mcp.json`) still lists those MCP servers.

## Assumptions

- Operators use VS Code or Cursor; this slice prioritizes VS Code workspace MCP paths without dropping Cursor `.cursor/mcp.json`.
- Existing finding classification in `findingGroups` remains the source of truth.
- Skills/rules “not analyzed” is expected while heuristics stay off; it is honest coverage, not an actionable gap for the status bar.
- No new Marketplace screenshot is required to ship if a capture is not available; README copy must still describe the view.
- Versioning remains a patch bump (0.1.24) per the constitution.

## Out of scope

Numeric 0–100 score, webview dashboard, re-enabling skill heuristics, new ecosystems, DLP/secrets, blocking installs, default extension deep-scan, extra network intel.
