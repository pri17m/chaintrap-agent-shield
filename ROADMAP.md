# Chaintrap Agent Shield — Product & Engineering Roadmap (IDE Extension)

**Document owner**: Chaintrap team  
**Scope**: VS Code / Cursor extension (local-first), optional org integrations  
**Starting point**: `0.1.24` (current repo state)

## 0) What “realistically doable” means for an IDE extension

A VS Code/Cursor extension effectively runs with **the same privileges as the user** in the editor context:

- **Can**: read/write workspace files, watch file changes, read some user config, render UI (trees, status, problems), store secrets in SecretStorage, call network APIs, optionally spawn processes (careful).
- **Cannot reliably**: firewall/sandbox arbitrary processes globally, stop a model provider from logging, guarantee tool execution constraints outside the editor, or enforce enterprise controls without an external policy/reporting plane.

So the product should optimize for:

- **High-fidelity visibility** (what changed, what was introduced, who/what pinned it)
- **Low-friction governance** (policy + evidence + reporting)
- **Minimal prompts** (only for high-confidence, high-severity, actionable findings)
- **Exportable artifacts** (SBOM/AIBOM-like inventory + VEX-like context) that security teams can operationalize

---

## 1) Product principles (to avoid burden + false positives)

### 1.1 Signal budget (default UX contract)

- **No modal prompts by default** except:
  - confirmed malware signals (OSV `MAL-*`), or
  - locally-curated denylist matches with strong provenance
- Everything else should land as:
  - **tree rows** + **Problems panel** + **Workspace posture rollup**
  - optional “Review delta since session start” / “Export report”

### 1.2 Deterministic, explainable findings

Each finding must show:

- **Evidence**: exact file (`path`) and line/section when feasible
- **Source**: baseline vs delta; workspace vs user config
- **Confidence**: high/medium/low (used for UI defaults)
- **Remediation**: safe action that does not execute untrusted code (edit-only where possible)

### 1.3 Honest coverage (no implied security)

If you cannot check something precisely, you must emit a coverage note:

- “direct pins only” (no lockfile)
- “unpinned/unknown version” (MCP or dependency range)
- “unsupported ecosystem / file type”
- “offline / advisory source unreachable”

### 1.4 Local-first, org-second

Default mode:

- no accounts, no telemetry, no uploading source
- network calls limited to package coordinates (name/version/ecosystem) to OSV

Org mode:

- explicit opt-in
- policies pulled as static files (YAML) or from an org endpoint
- reports exported locally and optionally uploaded

---

## 2) Standards & frameworks to align with (2026 current)

These are useful as “compliance language” and for shaping governance artifacts:

- **Supply chain / BOM**
  - SBOM formats: **CycloneDX 1.7** and **SPDX 2.3** (broad tooling support)
  - AI/ML BOM direction: CycloneDX AI/ML work (property taxonomy + evolving schema) and SPDX 3.x profiles
  - SLSA Build Track v1.0 (provenance maturity): [SLSA levels](https://slsa.dev/spec/v1.0/levels)
- **AI governance**
  - NIST AI RMF 1.0 (Govern/Map/Measure/Manage): [NIST AI RMF](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf)
  - NIST AI 600-1 (Generative AI profile): [NIST AI 600-1](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence)
  - ISO/IEC 42001:2023 AI management system: [ISO 42001](https://www.iso.org/standard/42001)
  - CSA AI Controls Matrix v1.1 (control objectives + mappings): [CSA AICM v1.1](https://cloudsecurityalliance.org/artifacts/ai-controls-matrix-v1-1)
- **AI threat taxonomies (good for “coverage” mapping)**
  - OWASP GenAI LLM Top 10 2026: [OWASP LLM Top 10 2026](https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/)
  - OWASP Agentic Top 10 2026: [OWASP Agentic Top 10 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)

Roadmap goal: produce IDE-native artifacts that can be referenced against these frameworks, without pretending the extension can “enforce everything”.

---

## 3) Capability map (what the extension should become)

Think in four layers:

1) **Inventory** (what exists): dependencies, MCP servers, AI/agent config, workflows, containers (static)
2) **Analysis** (what’s risky): malware/vulns, pin hygiene, provenance, policy rules, low-noise heuristics
3) **Workflow** (how users act): posture, delta review, safe remediation, export evidence
4) **Org** (how security teams consume): SBOM/VEX export, policy packs, CI/IDE parity, SIEM hooks

---

## 4) Versioned roadmap (sprints/iterations)

Notes:

- Versions below are **feature iterations**, not calendar commitments.
- Each iteration includes a **fidelity plan**: how we minimize prompts/false positives.
- “Subagents” are guidance for how to run agentic workstreams efficiently (Spec Kit + specialist agents).

### v0.2 — Low-noise fidelity + monorepo coverage

**Outcome**: fewer false positives, clearer “what was actually checked”, fewer missed packages in real workspaces.

**Scope**

- Expand inventory from “workspace root only” to **multi-root / monorepo**:
  - scan nested manifests where applicable (bounded search + caps)
  - treat nested roots as coverage-aware groups (no double counting)
- Replace “range stripped to floor version” behavior with explicit **unpinned/range** handling:
  - for `^`, `~`, `>=`, git/url/file/workspace specs: mark as **not-exact** (coverage gap), do not pretend it’s pinned
- Tighten MCP inference correctness:
  - recognize `uvx` explicitly and map Python modules more safely
  - keep “unknown version” as coverage gap, not vulnerability/malware

**Fidelity plan**

- no new modals
- coverage gaps appear in posture + Problems, not blocking UX

**Primary artifacts**

- “Coverage report” row: ecosystems, exact pins, non-exact specs, unsupported files

**Suggested subagents**

- `explore`: enumerate monorepo patterns + add inventory caps/guards
- `speckit-checklist`: requirements-quality checklist for “low-noise UX”

---

### v0.3 — MCP posture & policy (high value, low FP)

**Outcome**: MCP becomes a first-class “execution boundary” surface with high-confidence checks.

**Scope**

- MCP policy rules (local YAML):
  - require pinning for `npx`/`pipx`/`uvx` usage
  - allowlist command families (`node`, `python`, `npx`) and deny obvious droppers (`curl | sh`)
  - optional allowlist of known-good MCP packages (org can maintain)
- Risk signals from MCP `command/args` (high-confidence patterns only)
- “Quarantine” actions:
  - disable (comment/mark) server entries safely (prefer reversible edits over delete)

**Fidelity plan**

- MCP “dropper-like command” detection is **high severity but non-modal by default**
- only show modal when the server is both:
  - inferred to a known malicious package OR
  - matches a very high-confidence dropper signature and is newly introduced (delta)

**Suggested subagents**

- `generalPurpose`: design policy schema + examples
- `security-review`: review policy evaluation and config parsing for bypasses

---

### v0.4 — Skill/rule “Paranoid Mode” (opt-in, delta-first)

**Outcome**: cover AI-specific hijacks without spamming normal developers.

**Scope**

- Re-introduce heuristics from `src/scanners/skillHeuristics.ts` behind:
  - `chaintrap.enableParanoidSkillScan` (default false)
  - analyze **delta-only** by default (new/changed skill/rule files)
  - allow “trust this file hash” suppressions
- Findings output as:
  - “Suspicious instruction patterns” with evidence snippets
  - mapped to OWASP Agentic categories (ASI01/ASI06/etc) in the message text

**Fidelity plan**

- opt-in feature flag
- no modals
- strict rate limits (cap findings per file, per scan)
- focus on patterns with low ambiguity (unicode smuggling, `curl|sh`, hardcoded keys)

**Suggested subagents**

- `speckit-checklist`: requirements-quality checklist for “false-positive controls”
- `computerUse`: manual dogfooding with real repos to tune noise

---

### v0.5 — SBOM export (foundation for org compliance)

**Outcome**: security teams can ingest what the IDE saw; developers can attach evidence to tickets.

**Scope**

- Export inventory to **CycloneDX 1.7 JSON** (default) and/or **SPDX 2.3** (optional):
  - include direct + transitive (when lockfiles present)
  - include MCP-inferred packages as a separate “tooling” component group
  - include coverage gaps as annotations (not “clean”)
- Export findings as a lightweight **VEX-like** companion:
  - OSV IDs, advisory URLs, severity, and whether malicious (`MAL-*`)
  - do not overclaim exploitability; keep it “observed advisory presence”

**Fidelity plan**

- exports are on-demand commands, not background spam
- zero new prompts

**Suggested subagents**

- `generalPurpose`: map CycloneDX component fields + relationship graph
- `explore`: implement exporter with minimal dependencies (avoid heavy libs)

---

### v0.6 — Ecosystem onboarding tranche A (Cargo + Maven/Gradle “honest coverage”)

**Outcome**: first non-npm/PyPI ecosystems with consistent posture and coverage notes.

**Scope**

- Add ecosystems using OSV where feasible:
  - **Cargo**: parse `Cargo.lock` (high-fidelity transitive)
  - **Gradle**: parse dependency lockfiles when present (coverage note when absent)
  - **Maven**: parse `pom.xml` for direct deps + coverage note (no standard lock)
- Introduce generalized `Ecosystem` model:
  - stop hard-coding `"npm" | "pypi"` in types
  - handle OSV’s case-sensitive ecosystem strings correctly

**Fidelity plan**

- same UX surfaces as existing
- default behavior: coverage notes when no lock exists

**Suggested subagents**

- `explore`: survey lockfile formats and parser approach
- `security-review`: ensure parsers are robust against maliciously crafted files (DoS / huge inputs)

---

### v0.7 — Ecosystem onboarding tranche B (Go + NuGet + Ruby/Packagist basics)

**Outcome**: broader language coverage for real org footprints.

**Scope**

- **Go**: parse `go.sum` (versions) + `go.mod` (modules) with coverage notes
- **NuGet**: parse `packages.lock.json` when present; otherwise direct manifest coverage note
- Optional low-effort:
  - Ruby `Gemfile.lock`
  - PHP `composer.lock`

**Fidelity plan**

- keep “unknown/unpinned” honest
- avoid running build tools; stay file-based unless user explicitly opts-in

**Suggested subagents**

- `explore`: identify minimal parsers and fixtures

---

### v0.8 — Containers + CI supply-chain visibility (static checks, low FP)

**Outcome**: expand into “other domains” with mostly deterministic checks.

**Scope**

- **GitHub Actions hygiene**:
  - flag actions not pinned to SHAs
  - flag suspicious new third-party actions in delta
  - optionally query OSV ecosystem “GitHub Actions” for known issues (where usable)
- **Dockerfile hygiene** (static):
  - flag `FROM ...:latest` (unpinned)
  - flag missing digest pin (`@sha256:`) as coverage gap
  - flag `curl|sh` patterns and remote script execution

**Fidelity plan**

- “hygiene” findings default to info/medium, not modal
- only modal on clearly malicious patterns introduced in delta (high-confidence)

**Suggested subagents**

- `generalPurpose`: define ruleset and thresholds that minimize noise

---

### v0.9 — Org mode MVP (policy + reporting, still IDE-first)

**Outcome**: internal security teams can standardize guardrails without destroying dev UX.

**Scope**

- Org policy packs:
  - local repo policy file (e.g. `.chaintrap/policy.yml`) with:
    - allowed ecosystems
    - required lockfiles per ecosystem
    - MCP pinning rules
    - allow/deny package patterns
  - optional signed policy bundle pulled from an org endpoint (opt-in)
- Export bundles:
  - SBOM + findings + posture summary JSON
  - include mapping tags: OWASP LLM Top10 category, OWASP Agentic category, NIST AI RMF function (where applicable)
- Minimal “SOC hook”:
  - write reports to a deterministic location for an external forwarder/agent to ship (SIEM/EDR-friendly)

**Fidelity plan**

- policy violations appear as posture rows + Problems
- do not block editing; provide “review required” workflow instead

**Suggested subagents**

- `speckit-specify` + `speckit-plan` + `speckit-tasks`: define “Org policy” as a Spec Kit feature set
- `security-review`: review policy parsing and signature verification (if implemented)

---

### v1.0 — Compliance & AI governance pack (evidence-first)

**Outcome**: usable artifacts for ISO 42001 / NIST AI RMF / CSA AICM alignment without claiming “certification”.

**Scope**

- Governance inventory surfaces (IDE-visible + exportable):
  - “AI toolchain inventory”: installed AI extensions (ids/versions), configured model endpoints (safe subset), MCP servers, policy packs
  - “Risk register starter”: auto-populate entries from repeated findings + policy violations
- Mapping outputs:
  - crosswalk tags for ISO 42001 clauses (where the extension can provide evidence)
  - NIST AI RMF (Govern/Map/Measure/Manage) mapping for generated artifacts
  - CSA AICM domain tagging for controls touched (e.g., Model Security, Supply Chain)
- Evidence hardening:
  - add cryptographic hashes to exported bundles (tamper-evident local evidence)
  - stable schemas + versioned export formats

**Fidelity plan**

- governance features are “reports”, not prompts
- security team gets value without creating daily developer interruptions

**Suggested subagents**

- `generalPurpose`: produce mapping tables and “evidence we can actually generate” boundaries
- `speckit-checklist`: compliance requirements-quality checklist (avoid overclaiming)

---

## 5) Increment strategy: how to build without breaking UX

### 5.1 Release gating

- Every iteration should include:
  - fixtures that demonstrate new parsers/rules
  - tests that assert “no modal spam” behavior
  - a “coverage honesty” test (unknown/unpinned stays unknown)

### 5.2 Default severity policy (recommended)

- **critical**: OSV `MAL-*`, confirmed denylist, or similarly deterministic malware signal
- **high**: high-confidence “execution boundary” risks introduced in delta (MCP dropper-like commands)
- **medium/low**: hygiene, pinning gaps, non-exact specs, missing digests
- **info**: coverage notes, offline verification notes

### 5.3 Where org-level enforcement should live

To keep the IDE extension light:

- IDE = visibility + local policy + export
- org enforcement = CI gates + SIEM correlation + endpoint/network controls (outside extension)

---

## 6) Subagent assignments (recommended operating model)

Use these roles repeatedly per iteration:

- **Spec authoring**: `speckit-specify`
- **Design artifacts** (research + contracts + quickstart): `speckit-plan`
- **Dependency-ordered tasks**: `speckit-tasks`
- **Consistency review** (read-only): `speckit-analyze`
- **Implementation**: `speckit-implement`
- **Noise control & UX constraints**: `speckit-checklist` (create `ux.md` and `security.md`)
- **Security review of code changes**: `security-review`
- **Manual dogfooding**: `computerUse` (real repos, measure prompt/noise)

---

## 7) Open risks & constraints (call out early)

- **Maven without locks**: cannot be high-fidelity transitive without running tools; treat as coverage gap.
- **Container CVEs**: high-fidelity scanning requires image metadata/SBOMs; start with static hygiene and integrations later.
- **AI “governance data”**: avoid collecting sensitive prompts or source; focus on inventories and policy evidence.
- **False positives**: keep heuristics opt-in; delta-first; cap and dedupe aggressively.

