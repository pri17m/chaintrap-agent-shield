# Tasks: Finding Trust Hardening

**Input**: `specs/002-finding-trust/`

## Phase 1: Spec Kit artifacts

- [x] T001 Author `spec.md`, `plan.md`, `tasks.md`

## Phase 2: Quality must-haves

- [x] T002 ApiKeyStore + migrate/clear/set commands
- [x] T003 findingMerge replaceBaseline / applyDelta + scopeFindings
- [x] T004 Wire controller baseline/delta/publish/status/scan lock
- [x] T005 Align needsAckPopup + badge + acknowledge command (all high)
- [x] T006 Problems: unverifiedOnline as Warning; suppress all acked crit/high

## Phase 3: Efficiency follow-ups

- [x] T007 pnpm-lock.yaml + yarn.lock parsers; PRIVACY/README align; uv.lock deferred
- [x] T008 Export home watch root helpers; ensure RelativePattern(dir, pattern)
- [x] T009 Unit tests for merge, ackable count, secrets wrapper, lockfiles
- [x] T010 `npm test` green; no git commit

## Deferred

- uv.lock parsing (TOML complexity) — inventory still watches the file for delta scheduling only
