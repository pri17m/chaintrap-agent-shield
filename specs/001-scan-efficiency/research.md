# Research: Scan Efficiency Pass

## Decision: Ephemeral content on InventoryItem

**Rationale**: Inventory already reads skill/rule bodies to hash. Carrying `content?: string` for the current pass removes the second read in `analyzeItems` without enlarging persisted state if stripped on snapshot.

**Alternatives**: Separate content cache map in controller — more plumbing, same effect.

## Decision: Hash-stable skip on baseline

**Rationale**: Activation re-baselines every session. Unchanged skills dominate I/O after Spec Kit install. Skipping analyze when `key`+`hash` match prior baseline preserves findings via merge.

**Alternatives**: mtime-only skip — faster but weaker integrity; rejected for security product.

## Decision: Oversized file skip (no full read)

**Rationale**: Pathological multi-MB skill dumps can stall the host. Cap at 256 KiB; hash metadata only; skip heuristics for that file.

**Alternatives**: Stream/partial read — more complex; deferred.

## Decision: Soft file-count cap per walk

**Rationale**: Bound worst-case walks under user `~/.cursor/skills`. Default 400 files per tree root walk.

## Decision: Do not change lockfile transitive scanning in this slice

**Rationale**: Security coverage tradeoff needs separate spec; this slice focuses on I/O + re-analyze skip.
