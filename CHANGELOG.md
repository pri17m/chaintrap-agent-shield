# Changelog

## 0.1.34

- Detect-only inventory for OSV ecosystems beyond npm/PyPI: Maven (`pom.xml`, Gradle lockfiles), Go, crates.io, RubyGems, NuGet, Packagist, GitHub Actions, Pub, Hex, Swift, Hackage, CRAN, Conan
- Close holes: `bun.lock`, `pyproject.toml`, `pdm.lock`, `pylock.toml`
- MCP inference for `go run` / `go install`, `cargo install`, and `pipx` (URL/docker/`java -jar` still unchecked, with a reason)
- Honest coverage gaps: manifest without lockfile (direct pins only); Gradle DSL / Gemfile / mix.exs / Package.swift / conanfile without a lockfile (present, not scanned). No Maven graph resolution
- Workspace posture Checked lists exact pins per ecosystem. Fix issues still edits npm/PyPI/`mcp.json` only

## 0.1.33

- Marketplace listing: **Fix issues** section with the tools-button and confirm-dialog screenshots
- Listing copy: delete malware, pin/upgrade CVE and unpinned MCP, skip what cannot be edited; manifests only

## 0.1.32

- PyPI Fix issues understands two-part versions (`Markdown==3.8`) and `.postN` releases
- Vulnerable pins with no clean same-major release can move to a later major (e.g. Jinja2 2.10.1 → 3.1.6)

## 0.1.31

- npx MCP inference uses the first package token (including unversioned `@scope/name`). Extra args such as an org name are not treated as the package

## 0.1.30

- Fix issues confirm dialog groups delete / pin / skip and says why (malicious, unpinned, range, or CVE)
- Workspace posture keeps counts visible after a fix (no scan wipe) and re-inventories so Attention / Coverage numbers match the files
- Checked this workspace shows when Fix issues last ran and when the workspace was last cleared of malware/CVE

## 0.1.29

- **Fix issues** on posture, Dependencies, and MCP servers: one confirm, then delete malicious pins, pin unpinned/range specs to the highest OSV-clean version in-range, and upgrade vulnerable exact pins within the same major
- Still manifest-only (no npm/npx/pip); skip unchecked MCP, git/file specs, and packages with no clean version

## 0.1.28

- Pin unpinned MCP: choose **Pin latest (x.y.z)** (the published latest, or the version already resolved on scan) or type another exact version
- Pin/uninstall edit only the acted-on server (or dep) and keep the file's indent and surrounding entries
- After pin or uninstall, that finding is dropped from Problems and posture immediately so the same row is not acted on twice

## 0.1.27

- Unpinned MCP servers: look up the latest npm/PyPI version and classify that version (malware → Malicious, CVE/GHSA → Vulnerable). Copy says unpinned; latest is X — not what npx will install tomorrow
- MCP servers that are not packages (URL, docker, binary) show under Unchecked MCP servers instead of being hidden
- Posture coverage: MCP servers not packages (N) focuses the MCP view

## 0.1.26

- Honest pins: `^` `~` ranges, tags, and git/file specs are coverage gaps — not sent to OSV as a floor version
- `uvx` MCP servers infer PyPI (unpinned unless `name==version`)
- Nested/monorepo manifests and lockfiles are inventoried (skip `node_modules` / build dirs; lockfile still wins per directory)
- MCP `@latest` / range tags are unpinned coverage, not OSV-exact; Pin is npm/npx only

## 0.1.25

- Coverage gaps are clickable: pin unpinned MCP servers to an exact version in `mcp.json` (no npm/npx spawn)
- Pin action on unpinned MCP rows (inline and context menu)

## 0.1.24

- Workspace posture tree at the top of the Chaintrap activity bar (attention, coverage gaps, what was checked)
- Status bar follows the same rollup (malicious, then unacked high/critical, then coverage gaps, then packages checked); click focuses posture
- Inventory workspace `.vscode/mcp.json` in addition to `.cursor/mcp.json`

## 0.1.23

- Pin npm devDependencies and `@vscode/vsce` to exact versions; SHA-pin GitHub Actions

## 0.1.22

- Marketplace README: CISO-facing inventory copy; remove decorative rules and marketing captions

## 0.1.21

- Marketplace lead copy: MCP + dependency malware in the editor; drop “what we don’t do” from the first lines

## 0.1.20

- Uninstall malicious npm/PyPI pins by editing the manifest only (no `npm`/`pip` spawn — fixes Windows `spawn EINVAL`)

## 0.1.19

- MCP uninstall writes compact valid `mcp.json` into the open editor (no broken indent after removing a server)
- Drop MCP findings for servers that are no longer in the config when the file is still present

## 0.1.18

- Marketplace README: MCP servers tree + uninstall screenshots (replace old Dependencies-only shots)

## 0.1.17

- MCP servers view adds **Unpinned MCP servers** when the config has no package version
- Listing leads on MCP-config pins vs project dependencies; detection-only (does not wrap npm/pip)

## 0.1.16

- Split the activity bar into **Dependencies** and **MCP servers** (malicious vs vulnerable in each)
- MCP rows show the server id; uninstall removes that server, not every config with the same inferred package

## 0.1.15

- Scan locked transitives (npm lock v1/nested names, Yarn Berry, uv.lock, poetry.lock, Pipfile.lock)
- Informational note when a manifest has no lockfile (direct pins only)

## 0.1.14

- Listing copy: malware-protection value; drop capability-gap table and intel internals

## 0.1.13

- Marketplace listing copy: product outcomes only (no intel-pipeline details); typography on the listing README

## 0.1.12

- Marketplace and activity-bar icon: shield with interlocking chain links

## 0.1.11

- Remove install-protection docs command and listing copy (not shipping)

## 0.1.10

- Marketplace README uses only the Dependencies tree and activity-bar badge screenshots

## 0.1.9

- High/critical ack uses a branded **Chaintrap finding** webview (not the Visual Studio Code error dialog)
- Marketplace listing copy: README + `displayName` (**AI-Coding Security**) / description / keywords aligned to implemented package/MCP OSV checks only

## 0.1.8

- Fix empty Dependencies tree after reload: keep findings for unchanged packages; re-analyze when no stored finding covers that inventory key

## 0.1.7

- Dependencies view groups **Malicious** vs **Vulnerable** packages (baseline/delta stays on the row)
- Right-click Uninstall on malicious items: `npm uninstall`, `pip uninstall` + requirements strip, or remove MCP server from `mcp.json`
- Finding records a `malicious` flag (known-bad / OSV MAL-*)
- Uninstall from the Dependencies tree (does not intercept `npm` / `pip` at install time)

## 0.1.6

- Disable skill/rule heuristic findings (false positives). Inventory still records skills/rules; only npm/PyPI and MCP-inferred packages are flagged
- Marketplace-ready follow-up to 0.1.5 finding-trust hardening

## 0.1.5

- API key moves to VS Code SecretStorage (Set/Clear commands); plaintext setting deprecated + one-time migrate
- Baseline replaces in-scope findings; delta prunes removed paths; UI scoped to open roots + user config
- Badge, ack modal, and Acknowledge command agree on critical + all high; status bar refreshes after ack
- Scan lock: skip/coalesce delta while baseline (or another delta) runs
- Parse `pnpm-lock.yaml` / `yarn.lock` pinned packages; offline unverified findings show in Problems
- Spec Kit feature `specs/002-finding-trust`

## 0.1.4

- Scan efficiency: single-pass inventory, reuse skill/rule content in-memory, skip re-analysis when item hash matches prior baseline
- Soft caps for oversized skill files (256 KiB) and tree walks (400 files)
- Watchers aligned with inventory (commands, Claude settings, agent memory files); leaner debounce
- VSIX excludes Spec Kit scaffolding (`.specify`, `specs`, `.cursor`), graphs, and DBs
- Spec Kit (constitution + `specs/001-scan-efficiency`) for future agent-driven iteration

## 0.1.3

- Activity-bar badge shows unacknowledged high/critical finding count (SCM-style)
- Finding rows and ack modal open the local file first; advisory is a separate button
- Ack modal: Open location / Open advisory do not clear the finding — only “I understand the risk” does

## 0.1.2

- Skill scanner: Cisco-correlated local heuristics (HTML-comment payloads, markdown-image exfil, credential-exfil instructions, remote skill loading, permission/auto-approve abuse, agent-memory tamper, Unicode tag smuggling, IMDS, SessionStart hooks, encoded dropper chains)
- Inventory now includes slash commands, extra skill markdown, CLAUDE.md/MEMORY.md/SOUL.md, and `.claude/settings.json`

## 0.1.1

- Dependency popups say malicious vs vulnerable and show OSV `summary` as Description
- AI skill/rule high+critical findings now require the same ack modal
- Extra skill heuristics: prompt injection, curl|sh, hidden unicode, API base-URL hijack, `.ssh`/`.env` paths, password zip, raw-IP URLs

## 0.1.0

- Baseline scan of open workspace folders and user MCP/skills/rules
- Incremental watch + OSV querybatch analysis for new packages (including MCP-inferred npm/PyPI)
- Known-bad denylist offline fallback
- Warn + acknowledge on critical findings
- Agent Activity tree (baseline vs delta)
- Optional Chaintrap API deep scan for installed VS Code extensions
