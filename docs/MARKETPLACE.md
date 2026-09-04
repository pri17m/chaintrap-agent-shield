# Marketplace and growth notes (internal)

Living notes for listing `pri17m.chaintrap-agent-shield`. Marketing claims must match this inventory.

## A. Current-state audit (pre-rewrite, 0.1.9)

| Area | /10 | Note |
|------|-----|------|
| Branding | 5 | Teal shield+check is generic antivirus |
| Title | 5 | Brand-only; listing now uses **AI-Coding Security** |
| Description | 6 | Accurate but jargon-heavy (“EDR-style”) |
| SEO | 4 | Keywords missing “MCP security” |
| README | 5 | Dev-log, not a landing page; skill screenshots stale |
| Screenshots | 3 | PNG assets missing from tree; captions described old skill UI |
| Trust | 6 | PRIVACY.md exists; Marketplace copy was thin |
| UX | 7 | Real product (tree, ack webview, uninstall) |
| Conversion | 4 | Unclear install vs overselling runtime blocking |
| Differentiation | 6 | Unique: in-IDE OSV+denylist on agent/MCP **packages**, not tool-YARA |

## B. Feature inventory

### Confirmed (market)

| Feature | Evidence | Market? |
|---------|----------|---------|
| Inventory package.json / lockfiles / requirements.txt | `inventory.ts` | Yes |
| Parse pnpm-lock / yarn.lock pinned versions | `parsePnpmPackageKey`, `parseYarnLockBody` | Yes |
| Infer npm/PyPI from MCP command/args | `mcpParser.ts` | Yes |
| OSV querybatch + vuln summaries | `osvClient.ts` | Yes |
| Classify MAL-* as malicious; GHSA/CVE as vulnerable | `classifyOsvIds` | Yes |
| Bundled known-bad versions | `data/known_bad_packages.json`, `knownBad.ts` | Yes |
| Offline unverified finding | `packageAnalyzer.ts` | Yes |
| Baseline + delta watchers | `controller.ts`, `fileWatchers.ts` | Yes |
| Dependencies tree malicious vs vulnerable | `agentActivityTree.ts` | Yes |
| Ack webview | `ackWebview.ts` | Yes |
| Uninstall npm/pip/MCP entry | `uninstallFlow.ts` | Yes |
| Problems + status bar | `problems.ts`, `findingCopy.ts` | Yes |
| Optional extension-id deep scan | `chaintrapClient.ts` | Yes, as **optional** |

### Partial — describe narrowly

| Feature | Reality |
|---------|---------|
| uv.lock | Watched, not parsed |
| Range specifiers (`^`) | Floor version stripped; not “any matching version” |
| Skill/rule files | Inventoried; **heuristics off** |
| Scan skip-on-unchanged | Re-analyzes if no stored finding (0.1.8) |

### Do not market

Prompt injection, credential theft, exfil, YARA, MCP tool-schema analysis, live MCP connect, blocking npm/pip, security score 0–100, LLM judge, fuzzing, “stops supply-chain attacks”.

## C–H. Shipped in package.json + README

- Title: **Chaintrap Agent Shield — AI-Coding Security**
- Short description: see `package.json` `description`
- Keywords: ai-coding, ai agent, mcp, osv, npm, pypi, supply-chain, malware, cursor, security
- Categories: Linters, Other (VS Code has no Security category)

## F. Screenshot plan (capture after 0.1.9, real UI only)

| # | Capture | Caption | Why |
|---|---------|---------|-----|
| 1 | Chaintrap activity bar, Dependencies, Malicious + Vulnerable expanded, test repo open | Dependencies view after baseline | Main experience |
| 2 | Same tree with `nx@20.9.0` selected | Malicious package row | Proof of findings |
| 3 | Chaintrap finding webview for nx (not VS Code error dialog) | Ack panel | Trust + brand |
| 4 | Problems panel with chaintrap diagnostics | Problems | Secondary surface |
| 5 | Right-click Uninstall on malicious row | Uninstall | Remediation CTA |

Do not reuse skill-heuristic mockups. Commit PNGs under `media/screenshots/` then embed in README.

## I. Competition (honest)

| Product | They do | Chaintrap difference |
|---------|---------|----------------------|
| Cisco mcp-scanner | YARA/LLM on MCP **tools** | We scan **packages** inferred from MCP configs + lockfiles |
| Snyk Agent Scan | Broad agent discovery; account | We run without Snyk; OSV public |
| Golf Scanner | CLI risk score on MCP configs | We are in-editor + OSV MAL/CVE on deps |
| Dependabot / npm audit | Lockfile CVEs | We add MCP inference + known-bad + ack UX |

Positioning: **in-editor AI-coding security** — visibility for agent-installed npm/PyPI and MCP-inferred packages, not an MCP protocol fuzzer.

## J. 30-day installs (first 1k — realistic)

Week 1: Publish 0.1.9 listing copy; capture 5 screenshots; HN/Reddit **Show HN** with accurate scope; pin Marketplace link on GitHub README.  
Week 2: Short post: “What `npx` in mcp.json actually installs” + OSV.  
Week 3: Cursor/MCP Discord/forums — no spam; answer “how do I see agent deps”.  
Week 4: Compare-page blog vs Cisco/Snyk **without** claiming their features.

100 installs: listing + one technical post. 500–1k: ecosystem mentions + screenshots. 10k: needs SEO articles (see below), not Marketplace copy alone.

## Content titles (educate first)

1. What npm packages does my Cursor MCP config pull? — MCP security  
2. OSV MAL-* vs CVE in AI-agent lockfiles — osv malware  
3. Why `^` in package.json is not the version OSV checks — supply chain  
4. mcp.json npx -y and known-bad versions — MCP server security  
5. Visibility vs blocking: what this extension does not intercept — ai agent security  

## Icon spec

128×128 PNG (`media/icon.png`), `#081122` field, teal shield with interlocking chain links. Activity bar: `media/activitybar.svg`.
