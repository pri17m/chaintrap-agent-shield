# Privacy

Chaintrap Agent Shield is a local VS Code / Cursor extension. It is designed to work without an account.

## Data the extension reads

Only these surfaces are inventoried (workspace roots you have open, plus user agent config):

- Dependency manifests and lockfiles (`package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `uv.lock`, `requirements.txt`)
- MCP configs (workspace `.cursor/mcp.json`, `~/.cursor/mcp.json`, VS Code User `mcp.json`)
- Skill and rule files (`.cursor/skills`, `.claude/skills`, `.cursor/rules`, `AGENTS.md`, `.cursorrules`)

The extension does not execute workspace code. It does not upload source files.

## Data sent over the network

**Default (required for online package checks):** package **name**, **version**, and ecosystem (`npm` or `PyPI`) to `https://api.osv.dev/v1/querybatch`. Skill and rule **contents never leave the machine**.

**If OSV is unreachable:** the bundled `known_bad_packages.json` is used. Unknown packages are reported as “Could not verify online” — not treated as safe.

**Optional:** if you set `chaintrap.apiKey`, a VS Code extension **id** (and only that) may be sent to `chaintrap.apiBase` (default `https://scan.chaintrap.com`) for a deep bytecode scan. This is off until you set a key.

## Telemetry

No usage telemetry, crash pings, or advertising identifiers are collected in v1.

## Acknowledgments

Critical findings (known-bad or OSV `MAL-*`) require an in-editor acknowledgment. That choice is stored in VS Code `globalState` on your machine.

Policy: [https://chaintrap.com](https://chaintrap.com)
