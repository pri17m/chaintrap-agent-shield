# Implementation Plan: Scan Efficiency Pass

**Branch**: `001-scan-efficiency` | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-scan-efficiency/spec.md`

## Summary

Cut extension-host cost of baseline/delta by (1) single-pass inventory, (2) ephemeral content reuse for skill/rule heuristics, (3) hash-stable skip against prior baseline, (4) size/count caps on skill trees, (5) watcher + `.vscodeignore` alignment. No security model changes.

## Technical Context

**Language/Version**: TypeScript 5.7 / Node (VS Code extension host)

**Primary Dependencies**: `vscode` API types; mocha tests; no new runtime deps

**Storage**: `ExtensionContext.globalState` baselines/findings (strip ephemeral fields)

**Testing**: `npm test` (compile + mocha under `out/test`)

**Target Platform**: VS Code / Cursor ^1.85

**Project Type**: VS Code extension (brownfield)

**Performance Goals**: Avoid O(n) double reads; skip unchanged skill/rule/package re-analysis on repeat baseline

**Constraints**: No silent OSV pass; do not execute fixture packages; keep VSIX lean

**Scale/Scope**: User skill trees with hundreds of files (Spec Kit skills); typical workspace lockfiles

## Constitution Check

- Security Visibility First: skip only when hash unchanged; OSV offline path unchanged ✓
- Single-Pass Efficiency: FR-001/002/003 ✓
- Lean Extension Host: caps + strip content ✓
- Lean Packaging: vscodeignore ✓
- Spec-Driven: this plan + tasks ✓

## Project Structure

### Documentation (this feature)

```text
specs/001-scan-efficiency/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md
```

### Source Code

```text
src/
├── types.ts                 # ephemeral content on InventoryItem
├── scanners/inventory.ts    # caps, content attach, strip helper
├── scanners/itemAnalyzer.ts # use content; accept skip set
├── ui/controller.ts         # single inventory; hash skip
├── watchers/fileWatchers.ts # align globs
├── store/stateStore.ts      # strip on snapshot
└── test/analyzers.test.ts   # efficiency tests
.vscodeignore                # Spec Kit / graphs
```

## Complexity Tracking

None — incremental changes inside existing modules.

## Implementation Notes

- Export `persistableItem(item)` that omits `content`.
- `analyzeItems(items, source, fetchImpl?, options?: { skipKeys?: Set<string> })`.
- Controller computes `skipKeys` from prior baseline where `old.hash === new.hash` for all kinds (packages included) on baseline only; delta already only analyzes added/changed.
- Byte cap: if `stat.size > MAX`, set hash to `sha256("oversized:"+size+":"+mtime)` without reading body; do not attach content (heuristics skipped for that file — acceptable tradeoff documented in CHANGELOG).
