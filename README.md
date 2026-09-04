# Chaintrap Agent Shield

Workspace visibility for packages introduced by AI coding agents (Cursor, Claude Code, GitHub Copilot). Chaintrap inventories npm and PyPI pins in the open folder and in MCP server configs, classifies each as malicious or vulnerable, and lets the operator remove the pin from the editor.

[Marketplace](https://marketplace.visualstudio.com/items?itemName=pri17m.chaintrap-agent-shield) · [Privacy](PRIVACY.md)

<img src="media/screenshots/chaintrap-tree.png" alt="Chaintrap activity bar: Dependencies and MCP servers grouped as malicious, vulnerable, or unpinned">

## Coverage

- **Dependencies:** workspace manifests and lockfiles. With a lockfile, locked transitives are included.
- **MCP servers:** the package inferred from each server entry in `mcp.json` (for example `npx` or `pip`). Listed separately from project dependencies so the operator sees which server pulled the pin.
- **Unpinned MCP servers:** config has a package name and no version, so the pin cannot be checked.

Findings are malicious (known-bad or malware advisory) or vulnerable (CVE or GHSA). High and critical findings require an acknowledgement in the editor.

<img src="media/screenshots/uninstall-mcp.png" alt="Confirm removal of one MCP server from mcp.json">

<img src="media/screenshots/uninstall-package.png" alt="Confirm removal of a malicious PyPI pin from the manifest">

Malicious MCP servers are removed from that config by server id. Malicious npm and PyPI pins are removed from `package.json` or `requirements.txt`.

## Operation

1. Install `pri17m.chaintrap-agent-shield`.
2. Open a workspace folder. Status bar: `Chaintrap: scanning workspace…`
3. Open the Chaintrap activity bar: **Dependencies** or **MCP servers**.

No API key is required for this scan. The extension reads dependency and MCP files in open folders. It does not execute workspace code and does not upload source. See [PRIVACY.md](PRIVACY.md).

## Commands

| Command | Action |
|---|---|
| Chaintrap: Rescan workspace baseline | Run the workspace inventory again |
| Chaintrap: Review agent changes since last session | List findings that appeared after this window opened |
| Chaintrap: Acknowledge high/critical finding | Record that a serious finding was reviewed |
| Chaintrap: Uninstall malicious package | Remove a malware pin or that MCP server from the config |
| Chaintrap: Open finding location | Open the file that pinned the package |

MIT. [github.com/pri17m/chaintrap-agent-shield](https://github.com/pri17m/chaintrap-agent-shield)
