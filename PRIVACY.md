# Privacy



Chaintrap Agent Shield is a local VS Code / Cursor extension. It is designed to work without an account.



## Data the extension reads



Only these surfaces are inventoried (workspace roots you have open, plus user agent config):



- Dependency manifests and lockfiles (`package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `requirements.txt`). `uv.lock` is watched for change notifications but not fully parsed yet.

- MCP configs (workspace `.cursor/mcp.json`, workspace `.vscode/mcp.json`, `~/.cursor/mcp.json`, VS Code / Cursor User `mcp.json`)

- Skill and rule files (inventoried only; not heuristically flagged): `.cursor/skills`, `.claude/skills`, commands, `.cursor/rules`, `AGENTS.md`, `CLAUDE.md`, `MEMORY.md`, `SOUL.md`, `.cursorrules`, Claude settings JSON



The extension does not execute workspace code. It does not upload source files.



## Data sent over the network



**Default (required for online package checks):** package **name**, **version**, and ecosystem (`npm` or `PyPI`) to `https://api.osv.dev/v1/querybatch`, and when an advisory is shown, `https://api.osv.dev/v1/vulns/{id}` for the OSV **summary**. Skill and rule **contents never leave the machine** and are not analyzed for findings in 0.1.6.



**If OSV is unreachable:** the extension falls back to a bundled offline list of malicious packages. Unknown packages are reported as “Could not verify online” — not treated as safe.



**Optional:** if you store a Chaintrap API key via **Chaintrap: Set API key** (VS Code SecretStorage), a VS Code extension **id** (and only that) may be sent to `chaintrap.apiBase` (default `https://scan.chaintrap.com`) for a deep bytecode scan. The deprecated `chaintrap.apiKey` setting is migrated once into SecretStorage when present.



## Telemetry



No usage telemetry, crash pings, or advertising identifiers are collected in v1.



## Acknowledgments



Critical and high findings require an in-editor acknowledgment. That choice is stored in VS Code `globalState` on your machine.



Policy: [https://chaintrap.com](https://chaintrap.com)


