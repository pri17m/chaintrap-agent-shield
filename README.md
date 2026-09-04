# Chaintrap Agent Shield

**AI-coding security in the editor.** See what Cursor, Claude Code, and Copilot installed: scan open workspaces and MCP configs for **malicious** and **vulnerable** npm/PyPI packages—then review, acknowledge, or uninstall.

[Install from the Marketplace](https://marketplace.visualstudio.com/items?itemName=pri17m.chaintrap-agent-shield) · [GitHub](https://github.com/pri17m/chaintrap-agent-shield) · [Privacy](PRIVACY.md)

> This extension **flags** packages. It does **not** intercept `npm install` / `pip install` or stop `postinstall` scripts. Blocking installs is a separate product ([Chaintrap Guard](https://github.com/pri17m/extension-analyser/blob/main/docs/CHAINTRAP_GUARD.md)).

---

## Why install this?

Agents (Cursor, Claude Code, Copilot) can add MCP servers and dependencies without a human noticing. Manually grepping `mcp.json` and lockfiles does not tell you whether `nx@20.9.0` is on a malware denylist or whether OSV has a `MAL-*` advisory.

Chaintrap inventories those files, checks **exact versions** against [OSV](https://osv.dev) and a bundled known-bad list, and shows results in the editor.

| You get | You do not get |
|---------|----------------|
| Visibility on npm/PyPI pins and MCP-inferred packages | Prompt-injection or skill-content scanning (inventory only) |
| Malicious vs vulnerable grouping | Live MCP protocol fuzzing or YARA on server source |
| Ack + uninstall for flagged malware pins | Blocking `npm`/`pip` at runtime |

---

## Features

**MCP package inference**  
Reads workspace and user `mcp.json`, infers npm/PyPI packages from `npx` / `pip` / `-m` command lines, and scans those versions the same way as `package.json`.

**OSV + known-bad**  
Queries `api.osv.dev` for `MAL-*` (malicious) and CVE/GHSA (vulnerable). A local denylist still flags known campaigns if OSV is unreachable.

**Dependencies view**  
Activity-bar tree: **Malicious packages** and **Vulnerable packages**. Click opens the manifest. Right-click **Uninstall** on malicious items (`npm uninstall`, `pip uninstall` + `requirements.txt`, or remove an MCP server entry).

**Baseline and delta**  
On folder open, full inventory. File watchers then analyze **new or changed** items. Command: **Chaintrap: Review agent changes since last session**.

**Acknowledge high/critical**  
A **Chaintrap finding** panel (not a generic VS Code error box) for unacked high/critical items. “I understand the risk” is stored in `globalState`.

**Problems + status bar**  
Findings also appear in Problems. Offline packages not on the denylist are marked *Could not verify online*—not treated as safe.

---

## Example finding

**Severity:** critical  
**Finding:** This npm package is malicious  
**Package:** `nx@20.9.0` (known-bad / OSV `MAL-*` when listed)

**What Chaintrap detected:** The pinned version matches the bundled denylist (s1ngularity campaign) and/or OSV malware IDs for that exact `name@version`.

**Why it matters:** Compromised installer versions have shipped postinstall telemetry/exfil. Seeing the pin in `package.json` is not the same as knowing it is denylisted.

**In-product actions:** Open location, open OSV advisory (if present), acknowledge, or uninstall from the tree.  
**General guidance (not a runtime block):** Do not `npm install` that pin. Prefer a clean version and a lockfile.

---

## How it works

```text
Open folder / file change
        ↓
Inventory manifests, lockfiles, MCP configs
        ↓
Infer packages (npm / PyPI / MCP command lines)
        ↓
Known-bad (local) + OSV querybatch (name, version, ecosystem)
        ↓
Findings → Dependencies tree, Problems, ack panel
        ↓
Review, acknowledge, or uninstall
```

Skill and rule files are **listed in inventory** only. Heuristic content scanning is off (false positives).

---

## Install

### From VS Code / Cursor Marketplace

Search **Chaintrap Agent Shield** or install `pri17m.chaintrap-agent-shield`.

### First scan

1. Open a folder (status bar: `Chaintrap: scanning workspace…`).
2. Open the **Chaintrap** activity bar → **Dependencies**.
3. Optional: **Chaintrap: Rescan workspace baseline** from the Command Palette.

No API key is required for package/MCP checks.

---

## Commands

| Command | What it does |
|---------|----------------|
| **Chaintrap: Rescan workspace baseline** | Re-inventory and re-analyze |
| **Chaintrap: Review agent changes since last session** | Delta findings since this window opened |
| **Chaintrap: Acknowledge high/critical finding** | Pick an unacked finding |
| **Chaintrap: Uninstall malicious package** | From the Dependencies context menu |
| **Chaintrap: Open finding location** | Open the manifest/config file |
| **Chaintrap: Set / Clear API key** | SecretStorage for optional deep VS Code extension scans |
| **Chaintrap: Deep-scan installed VS Code extensions** | Optional; sends **extension id only** to `chaintrap.apiBase` |
| **Chaintrap: Open Guard install-protection docs** | Companion CLI that can block installs |

There is **no** Chaintrap CLI inside this extension.

---

## What is watched

| Surface | Paths | Analyzed for findings? |
|---------|--------|------------------------|
| Dependencies | `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `requirements.txt` | Yes (exact versions). `uv.lock` is watched only |
| MCP | `.cursor/mcp.json`, `~/.cursor/mcp.json`, VS Code User `mcp.json` | Yes — inferred packages |
| Skills / rules | `.cursor/skills`, `.claude/skills`, commands, `AGENTS.md`, `.cursorrules`, … | Inventoried only |

---

## Security and privacy

- **Reads** manifests, lockfiles, MCP JSON, and skill/rule paths above. Does not execute workspace code.
- **Sends to the network (default):** package **name**, **version**, and ecosystem to `https://api.osv.dev/v1/querybatch`, and `https://api.osv.dev/v1/vulns/{id}` for advisory summaries.
- **Does not upload** source files or skill/rule bodies.
- **Optional:** with a SecretStorage API key, VS Code **extension id** may be sent to `scan.chaintrap.com`.
- **Telemetry:** none in current versions (no usage pings).
- **Stored locally:** findings, acks, and baselines in VS Code `globalState`.

Full detail: [PRIVACY.md](PRIVACY.md).

---

## Who it is for

Developers and security reviewers using **Cursor / VS Code / Claude Code** who want an in-editor check of **what packages and MCP-inferred dependencies** are pinned—not a replacement for Guard, Snyk, or MCP protocol scanners.

---

## Open source

MIT. Source: [github.com/pri17m/chaintrap-agent-shield](https://github.com/pri17m/chaintrap-agent-shield). Issues welcome. No third-party audit is claimed.

---

## Settings

| Setting | Default | Purpose |
|---------|---------|---------|
| `chaintrap.apiBase` | `https://scan.chaintrap.com` | Optional deep-scan API |
| `chaintrap.apiKey` | empty | Deprecated — use **Set API key** |
| `chaintrap.enableDeepExtensionScan` | `false` | Notify when VS Code extensions change |

---

## Develop

```bash
npm install
npm test
npm run compile
npm run package
```

F5 → Extension Development Host. Dogfood folders: `fixtures/dogfood`, or a **manifest-only** test repo (do not `npm install` malware pins). See [DOGFOOD.md](DOGFOOD.md).
