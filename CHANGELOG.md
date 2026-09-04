# Changelog

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
