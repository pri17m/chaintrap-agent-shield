# Feature Specification: Multi-Ecosystem Detect Coverage

**Feature Branch**: `004-multi-ecosystem-detect`

**Created**: 2026-09-07

**Status**: Active

**Input**: Expand Chaintrap from npm/PyPI-only detect to all OSV-queryable language ecosystems on workspace lockfiles/manifests and MCP configs. Detect-only. Honest coverage gaps; no silent skips. No Fix issues write-back for new ecosystems.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Maven and other lockfiles are flagged (Priority: P1)

As a developer whose agent added a Maven, Go, or Cargo dependency, I want Chaintrap to inventory those pins and query OSV so a CVE like CVE-2026-63658 on `io.modelcontextprotocol:kotlin-sdk` is visible in Dependencies / posture.

**Why this priority**: npm/PyPI-only is a silent miss for JVM/Go/Rust agent installs.

**Independent Test**: Inventory a fixture `pom.xml` pinning `io.modelcontextprotocol:kotlin-sdk:0.13.0` yields a Maven package item; analyzePackages sends OSV ecosystem `Maven`.

**Acceptance Scenarios**:

1. **Given** a workspace `pom.xml` with a direct exact `groupId:artifactId` version, **When** inventory runs, **Then** that pin is inventoried as ecosystem `maven` with name `groupId:artifactId`.
2. **Given** `go.sum` or `Cargo.lock`, **When** inventory runs, **Then** locked transitives are inventoried as `go` / `crates`.
3. **Given** `package.json` without a lockfile but with `bun.lock`, **When** inventory runs, **Then** bun locked npm pins are used and no npm no-lockfile coverage note is emitted for that directory.

---

### User Story 2 - Honest coverage gaps (Priority: P1)

As an operator, I want recognizable projects without a parseable lockfile to show as coverage gaps rather than disappearing.

**Why this priority**: Silent skip is worse than an info-level gap.

**Independent Test**: A folder with `build.gradle.kts` and no `gradle.lockfile` yields an `unscanned` coverage item; `pom.xml` without a Gradle lock yields direct pins plus a `no-lockfile` coverage note.

**Acceptance Scenarios**:

1. **Given** `pom.xml` and no Gradle lockfile, **When** inventory runs, **Then** direct exact deps are checked and a coverage note says transitives were not resolved.
2. **Given** `build.gradle` or `build.gradle.kts` and no Gradle lockfile, **When** inventory runs, **Then** a coverage gap “project present, not scanned” is emitted.
3. **Given** a range/property version (`${rev}`, `^1.0`), **When** inventory runs, **Then** it is not sent to OSV as an exact pin.

---

### User Story 3 - MCP inference beyond npx/pip (Priority: P2)

As someone who launches MCP servers with `go run`, `cargo install`, or `pipx`, I want those packages classified the same way as npx/uvx pins. Docker, URL, and `java -jar` stay listed as unchecked with a reason.

**Independent Test**: MCP config with `go run github.com/foo/bar@v1.2.3` infers ecosystem `go`; `docker run` remains unchecked with docker in the message.

---

### User Story 4 - Posture counts every ecosystem (Priority: P2)

As an operator, I want Workspace posture Checked to list exact pins per ecosystem (not only npm and PyPI) so Maven/Go/Cargo scans are visible without opening Problems.

**Independent Test**: Inventory with a Maven pin increments packages-checked and a Maven row; Fix issues skips that finding.

---

### Edge Cases

- Maven names are `groupId:artifactId` (not npm-style).
- Go module paths preserve case.
- `vendor/`, `target/`, `bin/`, `obj/` are not walked.
- GitHub Actions `uses: docker://` and local `./` actions are skipped.
- OSV failure still surfaces unverified, never a silent pass.
- Fix issues does not write `pom.xml`, `go.mod`, or `Cargo.toml`.

## Requirements *(mandatory)*

- **FR-001**: `Ecosystem` MUST include npm, pypi, maven, go, crates, rubygems, nuget, packagist, github_actions, pub, hex, swift, hackage, cran, conan.
- **FR-002**: OSV querybatch MUST send the official ecosystem string (e.g. `Maven`, `crates.io`, `GitHub Actions`).
- **FR-003**: Lockfiles listed in the plan MUST be parsed locally with no `mvn`/`gradle`/`go list` spawn and no deps.dev resolution.
- **FR-004**: Manifest-only parseable files MUST add a no-lockfile coverage note; unparseable project markers MUST add an unscanned coverage note.
- **FR-005**: MCP inference MUST cover go/cargo/pipx plus existing npm/PyPI invokers; unmatched servers MUST state docker/url/jar/binary.
- **FR-006**: Posture Checked MUST count exact pins for every inventoried ecosystem.
- **FR-007**: Fix issues / pin / uninstall MUST skip non-npm/non-PyPI package findings.
- **FR-008**: Known-bad denylist remains npm/PyPI; OSV `MAL-*` still applies to any ecosystem.

## Success Criteria

- **SC-001**: `io.modelcontextprotocol:kotlin-sdk@0.13.0` in a fixture `pom.xml` is inventoried as Maven.
- **SC-002**: `npm test` green.
- **SC-003**: README/PRIVACY/CHANGELOG list ecosystems and remaining transitive/unparseable gaps.

## Out of scope

Fix issues write-back for new ecosystems, deps.dev Maven transitives, Docker/OS package scanning, skill heuristics, default extension deep-scan.
