# Privacy



Chaintrap Agent Shield is a local VS Code / Cursor extension. It is designed to work without an account.



## Data the extension reads



Only these surfaces are inventoried (workspace roots you have open, plus user agent config):



- Dependency manifests and lockfiles for OSV-queryable ecosystems, including `package.json` / npm lockfiles / `bun.lock`, `requirements.txt` / `pyproject.toml` / `uv.lock` / `poetry.lock` / `Pipfile.lock` / `pdm.lock`, `pom.xml` / Gradle lockfiles, `go.mod` / `go.sum`, `Cargo.lock`, `Gemfile.lock`, NuGet lockfiles, `composer.lock`, `.github/workflows/*.yml`, `pubspec.lock`, `mix.lock`, `Package.resolved`, Haskell freeze files, `renv.lock`, and `conan.lock`. Recognized project files that cannot be parsed (for example `build.gradle.kts` without a lockfile) are recorded as coverage gaps.

- MCP configs (workspace `.cursor/mcp.json`, workspace `.vscode/mcp.json`, `~/.cursor/mcp.json`, VS Code / Cursor User `mcp.json`)

- Skill and rule files (inventoried only; not heuristically flagged): `.cursor/skills`, `.claude/skills`, commands, `.cursor/rules`, `AGENTS.md`, `CLAUDE.md`, `MEMORY.md`, `SOUL.md`, `.cursorrules`, Claude settings JSON



The extension does not execute workspace code. It does not upload source files.



## Data sent over the network



**Default (required for online package checks):** package **name**, **version**, and ecosystem (OSV names such as `npm`, `PyPI`, `Maven`, `Go`, `crates.io`) to `https://api.osv.dev/v1/querybatch`, and when an advisory is shown, `https://api.osv.dev/v1/vulns/{id}` for the OSV **summary**. Skill and rule **contents never leave the machine** and are not analyzed for findings.



**If OSV is unreachable:** the extension falls back to a bundled offline list of malicious packages. Unknown packages are reported as “Could not verify online” — not treated as safe.



**Optional:** if you store a Chaintrap API key via **Chaintrap: Set API key** (VS Code SecretStorage), a VS Code extension **id** (and only that) may be sent to `chaintrap.apiBase` (default `https://scan.chaintrap.com`) for a deep bytecode scan. The deprecated `chaintrap.apiKey` setting is migrated once into SecretStorage when present.



## Telemetry



No usage telemetry, crash pings, or advertising identifiers are collected in v1.



## Acknowledgments



Critical and high findings require an in-editor acknowledgment. That choice is stored in VS Code `globalState` on your machine.



Policy: [https://chaintrap.com](https://chaintrap.com)


