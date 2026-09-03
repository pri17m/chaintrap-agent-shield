# Changelog

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
