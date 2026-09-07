# Implementation Plan: Multi-Ecosystem Detect Coverage

**Branch**: `004-multi-ecosystem-detect` | **Date**: 2026-09-07 | **Spec**: [spec.md](./spec.md)

## Technical Context

**Language/Version**: TypeScript 5.9, VS Code Extension API 1.85  
**Testing**: Mocha TDD under `src/test/` (`npm test`)  
**Target platform**: VS Code / Cursor extension host (Windows/macOS/Linux)  
**Project type**: Single-package VS Code extension  
**Constraints**: No workspace execution; no heavy resolvers; no new runtime npm dependencies; OSV failures → unverified.

## Constitution Check

- Security Visibility First: coverage gaps instead of silent skip; OSV down → unverified.
- Single-Pass Efficiency: one walk; parser table by filename.
- Lean Extension Host: skip `vendor`/`target`/`bin`/`obj`; cap walk; no Maven graph fetch.
- Lean Packaging: parsers in `out/` only.
- Spec-Driven Brownfield: this feature directory.

## Architecture

1. [`src/scanners/ecosystems.ts`](../../src/scanners/ecosystems.ts) — closed union helpers, OSV map, labels, lockfile hints, writable (npm/PyPI only).
2. [`src/scanners/ecoParsers.ts`](../../src/scanners/ecoParsers.ts) — local lockfile/manifest parsers returning `{ name, version }`.
3. Inventory discovers extra filenames; per-directory lock-wins; GitHub Actions from `.github/workflows`.
4. MCP invoker table in `mcpParser.ts`.
5. Posture `pinsByEcosystem`; Fix issues skips non-writable ecosystems.

## Wave A

Maven `pom.xml`, Gradle lockfiles + unscanned Gradle DSL, Go, Cargo.lock, bun.lock, pyproject.toml / pdm.lock / pylock.toml, MCP go/cargo/pipx.

## Wave B

RubyGems, NuGet, Packagist, GitHub Actions `uses:`.

## Wave C

Pub, Hex, Swift, Hackage, CRAN, Conan + unparseable-manifest gaps (Gemfile, mix.exs, Package.swift, conanfile).
