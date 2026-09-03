# Feature Specification: Finding Trust Hardening

**Feature Branch**: `002-finding-trust`  
**Created**: 2026-09-03  
**Status**: Active  
**Input**: Pre-publish quality blockers (SecretStorage, stale findings, badge/ack/status) plus small efficiency follow-ups. Code + tests only — no commit/release in this slice.

## User Scenarios & Testing

### User Story 1 — Trusted API key storage (P1)

As a developer enabling optional deep extension scans, I want my Chaintrap API key stored in VS Code SecretStorage (not plaintext settings.json).

**Acceptance**:

1. Given Set API key command, When I enter a key, Then it is stored via `secrets` and deep-scan uses it.
2. Given an old `chaintrap.apiKey` setting, When the extension activates, Then it migrates once into SecretStorage and clears the setting value when possible.
3. Given Clear API key, When run, Then deep-scan reports missing key.

### User Story 2 — Findings stay accurate (P1)

As a user, I want baseline rescans to drop findings for packages/skills that are gone, and deltas to prune removed paths — not accumulate forever.

**Acceptance**:

1. Given baseline with evil@1.0.0, When package is removed and baseline rescans, Then that finding disappears (acks retained for IDs that still exist).
2. Given delta removes a skill file, When delta completes, Then findings for that path are pruned.
3. Given findings from a closed workspace root, When another folder is open, Then the tree prefers open roots + user config.

### User Story 3 — Badge matches what I can acknowledge (P1)

As a user, I want the activity-bar badge to count only findings I can ack via modal or Acknowledge command, including package OSV high, and the status bar to update after ack.

**Acceptance**:

1. Given unacked critical and high findings, When badge shows N, Then Acknowledge command lists the same set.
2. Given I ack all, When UI refreshes, Then badge is cleared and status is not stuck on “N critical”.

### User Story 4 — Efficient follow-ups (P2)

Home skill watchers work; pnpm/yarn lockfiles contribute pinned packages; oversized caps remain tested; offline unverified findings appear in Problems as warnings.

## Requirements

- FR-001 SecretStorage for API key; deprecate plaintext setting  
- FR-002 Baseline replace + delta prune with ack preservation  
- FR-003 Scope UI findings to open roots + user-level paths  
- FR-004 Align needsAckPopup / badge / acknowledge command (critical + all high)  
- FR-005 Refresh status after every ack path; keep scan lock during baseline  
- FR-006 Parse pnpm-lock.yaml + yarn.lock pinned versions; defer uv.lock  
- FR-007 Problems shows unverifiedOnline as Warning  
- FR-008 Home RelativePattern watchers use dir + pattern helpers (testable)

## Out of scope

Marketplace publish, git commit, LLM skill judge, blocking installs, full workspaceState baseline migration.
