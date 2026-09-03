# Tasks: Scan Efficiency Pass

**Input**: Design documents from `/specs/001-scan-efficiency/`

## Phase 1: Setup

- [x] T001 Confirm Spec Kit init (`.specify/`, `.cursor/skills/speckit-*`) and feature dir `specs/001-scan-efficiency`

## Phase 2: Foundational

- [x] T002 [P] Extend `InventoryItem` with optional `content` in `src/types.ts`; add `persistableItem` helper in `src/scanners/inventory.ts`
- [x] T003 [P] Add byte/count caps and attach content in `parseTextFiles` / walks in `src/scanners/inventory.ts`
- [x] T004 Strip content in `StateStore.snapshotFromItems` via `persistableItem`

## Phase 3: User Story 1+2 (P1)

- [x] T005 Update `analyzeItems` to prefer `item.content` and honor `skipKeys` in `src/scanners/itemAnalyzer.ts`
- [x] T006 Refactor `ShieldController.runBaseline` to single inventory + hash-stable skipKeys in `src/ui/controller.ts`
- [x] T007 Add unit tests for content reuse, persistable strip, skipKeys, oversized skip in `src/test/analyzers.test.ts`

## Phase 4: User Story 3+4 (P2)

- [x] T008 Align `createWatchers` globs with inventory in `src/watchers/fileWatchers.ts`
- [x] T009 Update `.vscodeignore` for `.specify/**`, `specs/**`, `.cursor/**`, graphs/dbs
- [x] T010 Bump version to 0.1.4 + CHANGELOG; run `npm test` and `npm run package`

## Phase 5: Polish

- [x] T011 README Spec Kit invoke path; converge notes in this tasks file
