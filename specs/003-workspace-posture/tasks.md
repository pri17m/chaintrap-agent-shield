# Tasks: Workspace Posture Insight

**Input**: Design documents from `/specs/003-workspace-posture/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/posture.md

## Phase 1: Setup

- [x] T001 Author Spec Kit artifacts under `specs/003-workspace-posture/` and set `.specify/feature.json`

## Phase 2: Foundational

- [x] T002 [P] Implement `summarizeInventory` + `buildPosture` in `src/ui/postureModel.ts` per `contracts/posture.md`
- [x] T003 [P] Parse workspace `.vscode/mcp.json` in `src/scanners/inventory.ts` and watch `**/.vscode/mcp.json` in `src/watchers/fileWatchers.ts`

## Phase 3: User Story 1 — Posture tree (P1)

- [x] T004 Native `PostureProvider` in `src/ui/postureTree.ts` (three groups + placeholders)
- [x] T005 Register `chaintrap.posture` as the first view in `package.json`; wire in `src/extension.ts` and `src/ui/controller.ts` (`publish` / `refreshUi` / scanning)

## Phase 4: User Story 2 — Status bar (P1)

- [x] T006 Status-bar text/tooltip from `PostureModel`; click runs `chaintrap.focusPosture`; remove baseline `ready` / packages-skills idle flash in `src/ui/findingCopy.ts` and `src/ui/controller.ts`; keep `chaintrap.reviewDelta`

## Phase 5: User Story 3 — VS Code MCP + honest coverage (P2)

- [x] T007 Checked-group MCP source labels; skills/rules “inventoried, not analyzed” excluded from status-bar gap count (covered by T002 + T003)

## Phase 6: Tests and docs

- [x] T008 Unit tests in `src/test/postureModel.test.ts` (rollup priority, empty/scanning, unpinned vs unverified, skills not in gap count)
- [x] T009 Inventory test for `.vscode/mcp.json`; update status-bar assertion that expected `Chaintrap: ready`
- [x] T010 README Operation, CHANGELOG 0.1.24, PRIVACY MCP path list, `package.json` version 0.1.24
- [ ] T011 `npm test` green
