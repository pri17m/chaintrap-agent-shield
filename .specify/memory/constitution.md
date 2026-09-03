# Chaintrap Agent Shield Constitution

## Core Principles

### I. Security Visibility First
The extension is an EDR-style sensor for AI agent installs (MCP, npm/PyPI, skills, rules). Findings must remain trustworthy: known-bad and local skill heuristics always run offline; OSV failures must surface as unverified — never a silent pass.

### II. Single-Pass Efficiency
Inventory and analysis must avoid redundant filesystem and network work. Prefer one inventory walk per scan, reuse in-memory file content within a pass, and skip re-analysis of unchanged item hashes when a prior baseline exists. Debounce and batch watcher-driven deltas.

### III. Lean Extension Host
Minimize extension-host CPU and memory: cap oversized skill-tree reads, strip ephemeral fields (file content) before persisting baselines, and keep activation work aligned with the inventory surface (not broad recursive watches of unrelated trees).

### IV. Lean Packaging
VSIX must ship only runtime assets (`out/`, `data/`, media). Never package graphs, databases, Spec Kit scaffolding, fixtures, or source maps. Keep `.vscodeignore` as a release gate.

### V. Spec-Driven Brownfield Iteration
Non-trivial product changes go through Spec Kit (constitution → specify → plan → tasks → implement → converge). Ship one coherent slice at a time; keep tests green (`npm test`) before packaging.

## Additional Constraints

- Publisher: `pri17m`. Version via patch bumps for incremental efficiency/security fixes.
- Do not execute workspace or fixture package code during scans or tests.
- Prefer TypeScript + VS Code Extension API; no heavy runtime dependencies without clear need.
- Windows/macOS/Linux path coverage for Cursor and VS Code user config remains supported.

## Development Workflow

1. Update or create `specs/<nnn>-<name>/` artifacts for the slice.
2. Implement with unit tests under `src/test/`.
3. Run `npm test`, then `npm run package` for VSIX when shipping.
4. Do not Marketplace-publish from agents; leave `.github` workflows untracked if the push token lacks `workflow` scope.

## Governance

This constitution supersedes ad-hoc agent instructions when they conflict on security or packaging. Amendments require updating this file and noting the version below. Complexity must justify measurable efficiency or security gain.

**Version**: 1.0.0 | **Ratified**: 2026-09-03 | **Last Amended**: 2026-09-03
