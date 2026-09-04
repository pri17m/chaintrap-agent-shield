# Implementation Plan: Workspace Posture Insight

**Branch**: `003-workspace-posture` | **Date**: 2026-09-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-workspace-posture/spec.md`

## Summary

Add an ephemeral Workspace posture tree and aligned status-bar copy derived from existing findings plus the current inventory list. Parse workspace `.vscode/mcp.json`. No new scanners, score, webview, or persisted state.

## Technical Context

**Language/Version**: TypeScript 5.9 / VS Code Extension API `^1.85.0`

**Primary Dependencies**: Existing extension modules (`findingGroups`, `inventory`, `ShieldController`). No new runtime packages.

**Storage**: None new (in-memory `InventorySummary` on the controller)

**Testing**: Mocha TDD under `src/test/` (`npm test`)

**Target Platform**: VS Code / Cursor desktop, local folders

**Project Type**: VS Code extension (single project)

**Performance Goals**: Posture build is in-memory only; no extra `readFileSync` or OSV

**Constraints**: Constitution I–IV; skill heuristics stay off; VSIX still excludes Spec Kit paths

**Scale/Scope**: One activity-bar view, status-bar copy, MCP path add, tests, docs; version 0.1.24

## Constitution Check

- Security Visibility First: unverified stays unverified; no silent pass; heuristics remain off.
- Single-Pass Efficiency: posture uses the scan’s item list and findings only.
- Lean Extension Host: no extra watches beyond one glob for `.vscode/mcp.json`.
- Lean Packaging: no new VSIX assets required.
- Spec-Driven Brownfield Iteration: this feature directory + `npm test` before package.

Gates pass. Re-check after design: still pass.

## Project Structure

### Documentation (this feature)

```text
specs/003-workspace-posture/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/posture.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/ui/postureModel.ts      # summarizeInventory + buildPosture
src/ui/postureTree.ts       # TreeDataProvider
src/ui/findingCopy.ts       # statusBarText delegates to posture
src/ui/controller.ts        # publish / refreshUi / scanning
src/extension.ts            # register view + focus command
src/scanners/inventory.ts   # .vscode/mcp.json
src/watchers/fileWatchers.ts
src/test/postureModel.test.ts
src/test/analyzers.test.ts  # inventory + status-bar assertions
package.json                # view + command + 0.1.24
```

**Structure Decision**: Extend the existing single-package extension. Keep rollup pure and VS Code tree wiring separate.

## Complexity Tracking

None. One tree + one inventory path is justified by VS Code MCP visibility and operator insight.
