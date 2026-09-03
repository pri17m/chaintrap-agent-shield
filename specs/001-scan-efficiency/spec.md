# Feature Specification: Scan Efficiency Pass

**Feature Branch**: `001-scan-efficiency`

**Created**: 2026-09-03

**Status**: Active

**Input**: Make Chaintrap Agent Shield baseline/delta scans faster and cheaper on the extension host while keeping the security model (OSV + known_bad + local skill heuristics; no silent pass offline). One shippable efficiency slice — not a rewrite.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Faster repeat baselines (Priority: P1)

As a developer opening Cursor/VS Code with Agent Shield installed, I want baseline scans to skip re-analyzing inventory items whose content hash is unchanged since the last baseline so activation stays quick even when I have large skill trees (including Spec Kit skills).

**Why this priority**: Activation cost dominates daily UX; Spec Kit and other skill packs make user skill trees large.

**Independent Test**: Run inventory+analyze twice with unchanged fixtures; second pass must not re-read skill file bodies for unchanged hashes and must not drop prior skill findings.

**Acceptance Scenarios**:

1. **Given** a prior baseline with skill/rule hashes, **When** baseline runs again with identical files, **Then** those skills/rules are not re-read from disk for heuristics and existing findings for them remain.
2. **Given** a skill file changes, **When** baseline or delta runs, **Then** that skill is re-hashed and re-analyzed.

---

### User Story 2 - Single-pass inventory I/O (Priority: P1)

As the extension host, I want each baseline/delta to walk and read skill/rule files once per pass (content reused for hash + heuristics) and to inventory each workspace/user root once (no double `inventoryWorkspaceRoot` / `inventoryUserConfig` in the same baseline).

**Why this priority**: Current code double-inventories and double-reads; easy win with no security tradeoff.

**Independent Test**: Unit tests assert items can carry ephemeral content used by analyzer; controller baseline builds snapshots from the same item lists used for analysis.

**Acceptance Scenarios**:

1. **Given** skill files on disk, **When** inventory runs, **Then** analyzer can use in-memory content without a second `readFileSync` for the same path in that pass.
2. **Given** baseline persistence, **When** snapshots are stored, **Then** ephemeral `content` is stripped so globalState stays lean.

---

### User Story 3 - Guardrails for huge skill trees (Priority: P2)

As a user with very large skill directories, I want the scanner to skip or truncate oversized individual files (byte cap) and soft-cap file count per skill tree so one pathological tree cannot stall the host — while still scanning normal SKILL.md / notes / scripts.

**Why this priority**: Protects CPU/memory without removing coverage for typical skills.

**Independent Test**: Fixture with an oversized file is skipped (or marked without full read); normal small skills still inventory.

**Acceptance Scenarios**:

1. **Given** a skill file larger than the configured byte cap, **When** inventory runs, **Then** full content is not loaded into memory for hashing/heuristics.
2. **Given** a normal small skill tree, **When** inventory runs, **Then** behavior matches prior coverage (commands, notes.md, SKILL.md, rules).

---

### User Story 4 - Watcher + VSIX alignment (Priority: P2)

As a maintainer packaging the extension, I want file watchers to cover the same surfaces inventory scans, and `.vscodeignore` to exclude Spec Kit scaffolding, graphs, and DBs so VSIX stays lean.

**Why this priority**: Prevents missed deltas and accidental bloat.

**Independent Test**: Inspect watcher globs vs inventory paths; package ignores include `.specify/**`, `specs/**`, `.cursor/**`, graphs, `*.db`.

**Acceptance Scenarios**:

1. **Given** changes under `.claude/commands` or `.claude/settings.json`, **When** files change, **Then** a delta is scheduled.
2. **Given** `vsce package`, **When** VSIX is built, **Then** `.specify`, `specs`, and graph/db artifacts are excluded.

---

### Edge Cases

- Missing prior baseline: full analyze (current behavior).
- Concurrent baseline + delta: debounce still coalesces deltas; baseline remains authoritative when both fire.
- Unreadable files: skip without throwing (current behavior).
- Offline OSV: still emit unverified findings for packages not on known-bad (no silent pass).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Baseline MUST inventory each root at most once per run and reuse that list for analysis and snapshot.
- **FR-002**: Skill/rule inventory MAY attach ephemeral `content` for the current pass; persistence MUST strip it.
- **FR-003**: On baseline, items whose `key`+`hash` match the prior baseline MUST skip heuristic re-analysis; package/MCP OSV policy for unchanged packages MAY also skip re-query when hash unchanged (prefer skip to cut host+network cost).
- **FR-004**: Inventory MUST enforce a per-file byte cap for skill/rule bodies (default 256 KiB) and a soft max file count per tree walk (default 400).
- **FR-005**: Watchers MUST include inventory-aligned globs for commands, settings, and agent memory files.
- **FR-006**: `.vscodeignore` MUST exclude Spec Kit / graph / db paths from VSIX.
- **FR-007**: Security model unchanged: known_bad + heuristics always local; OSV failure → unverified, never silent pass.

### Key Entities

- **InventoryItem**: key, kind, path, hash, optional ephemeral content, package metadata.
- **BaselineSnapshot**: persisted map of items without ephemeral fields.
- **Finding**: unchanged schema.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Second baseline on an unchanged workspace performs zero skill/rule `readFileSync` for previously hashed unchanged paths (verified by unit test with injectable/stub or by content-reuse path that does not call fs again).
- **SC-002**: `npm test` passes.
- **SC-003**: Packaged VSIX does not contain `.specify`, `specs/`, `.code-review-graph`, or `*.db`.
- **SC-004**: Patch release 0.1.4 documents the efficiency slice in CHANGELOG.
