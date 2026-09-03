# Implementation Plan: Finding Trust Hardening

**Feature**: `002-finding-trust`  
**Version target**: 0.1.5 (local; no commit until user asks)

## Architecture

```text
SecretStorage (ApiKeyStore)
        │
extension.ts ──► ShieldController
                      │
         findingMerge.ts (pure) ◄── StateStore (acks + findings)
                      │
              publish → badge / status / Problems / tree
```

## File changes

| Area | Files |
|------|--------|
| Spec | `specs/002-finding-trust/*` |
| Secrets | `src/store/apiKeyStore.ts` |
| Merge | `src/ui/findingMerge.ts` |
| Ack/badge | `src/ui/findingCopy.ts`, `ackFlow.ts`, `controller.ts`, `problems.ts` |
| Extension | `src/extension.ts`, `package.json` |
| Inventory | `src/scanners/inventory.ts` (pnpm/yarn) |
| Watchers | `src/watchers/fileWatchers.ts` |
| Docs | `PRIVACY.md`, `README.md`, `CHANGELOG.md` |
| Tests | `src/test/analyzers.test.ts` (+ merge/secrets helpers) |

## Deferred

- `uv.lock` parser — heavy TOML; watchers remain; document deferred in tasks.md
