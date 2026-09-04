<div align="center">

<img src="media/icon.png" width="112" height="112" alt="Chaintrap Agent Shield">

<h1 style="font-family: Palatino, 'Palatino Linotype', 'Book Antiqua', Georgia, serif; font-weight: 700; letter-spacing: -0.03em; margin: 0.4em 0 0.25em;">Chaintrap Agent Shield</h1>

<p style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif; font-size: 1.15em; line-height: 1.45; max-width: 38em; margin: 0 auto 1em;">
<b>See if an MCP server config pulls a malicious or vulnerable package—separate from project dependencies.</b><br>
When Cursor, Claude Code, or Copilot adds a pin, Chaintrap flags malware vs a known CVE so you can uninstall it. Detection-only: does not wrap npm or pip.
</p>

<p style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif;">
<a href="https://marketplace.visualstudio.com/items?itemName=pri17m.chaintrap-agent-shield"><b>Marketplace</b></a>
&nbsp;·&nbsp;
<a href="https://github.com/pri17m/chaintrap-agent-shield"><b>GitHub</b></a>
&nbsp;·&nbsp;
<a href="PRIVACY.md"><b>Privacy</b></a>
</p>

</div>

<p align="center"><img src="media/screenshots/chaintrap-tree.png" alt="Chaintrap activity bar: Dependencies and MCP servers, each split into malicious, vulnerable, and unpinned"></p>

<p align="center" style="font-family: Palatino, 'Palatino Linotype', Georgia, serif; font-style: italic;">Project dependencies in one list. MCP servers in another. Malicious vs vulnerable vs unpinned—so you see which <code>mcp.json</code> server pulled a bad pin, not only the npm name.</p>

<p align="center"><img src="media/screenshots/uninstall-mcp.png" alt="Confirm removing one MCP server from mcp.json without deleting every server that uses the same package"></p>

<p align="center" style="font-family: Palatino, 'Palatino Linotype', Georgia, serif; font-style: italic;">Right-click a malicious MCP server. That server comes out of the config. Other servers that happen to use the same package stay.</p>

<p align="center"><img src="media/screenshots/uninstall-package.png" alt="Confirm uninstall of a malicious PyPI pin from the manifest without running pip install"></p>

<p align="center" style="font-family: Palatino, 'Palatino Linotype', Georgia, serif; font-style: italic;">Same action for a malware pin in the manifest. Detection-only: does not wrap npm or pip.</p>

---

<h2 style="font-family: Palatino, 'Palatino Linotype', 'Book Antiqua', Georgia, serif; font-weight: 700;">Why install this?</h2>

<p style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif; line-height: 1.55;">
AI coding agents install npm and PyPI packages for you. A malicious version can steal credentials, run extra scripts, or quietly stay in the lockfile after the chat is over.
</p>

<p style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif; line-height: 1.55;">
Agents also drop MCP servers into <code>.cursor/mcp.json</code> with <code>npx</code> or <code>pip</code>. Those pins never show up in <code>package.json</code>. Chaintrap infers the package from the server config and lists it under <b>MCP servers</b>—malicious, vulnerable, or unpinned—next to your lockfile findings.
</p>

<p style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif; line-height: 1.55;">
You see it in the editor. You can open the pin, acknowledge the risk, or uninstall it in one step.
</p>

---

<h2 style="font-family: Palatino, 'Palatino Linotype', 'Book Antiqua', Georgia, serif; font-weight: 700;">Features</h2>

<p style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif; line-height: 1.55;">
<b>Catch malware in the project.</b> Scans your workspace and flags a dependency if it is malicious or vulnerable. When a lockfile is present, that includes locked transitives—not only what you typed in the manifest.
</p>

<p style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif; line-height: 1.55;">
<b>See MCP servers on their own list.</b> If a server config pulls a malicious or vulnerable package, it shows under MCP servers—not mixed into Dependencies. No version in the args? It lands in Unpinned. This is the package the config would install, not a scan of MCP tool schemas.
</p>

<p style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif; line-height: 1.55;">
<b>Act from the tree.</b> Malicious vs vulnerable lists. Click to open the file. Right-click to uninstall malware pins.
</p>

<p style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif; line-height: 1.55;">
<b>Keep watching.</b> Full check when you open a folder. Then new and changed items are reviewed as the agent keeps working.
</p>

<p style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif; line-height: 1.55;">
<b>Make the risk explicit.</b> High and critical findings open a Chaintrap panel so you confirm you understand before you move on.
</p>

---

<h2 style="font-family: Palatino, 'Palatino Linotype', 'Book Antiqua', Georgia, serif; font-weight: 700;">Get started</h2>

<ol style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif; line-height: 1.55;">
<li>Install <b>Chaintrap Agent Shield</b> (<code>pri17m.chaintrap-agent-shield</code>).</li>
<li>Open a folder. Status bar: <code>Chaintrap: scanning workspace…</code></li>
<li>Open the <b>Chaintrap</b> activity bar → <b>Dependencies</b> or <b>MCP servers</b>.</li>
</ol>

<p style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif;">No API key required.</p>

---

<h2 style="font-family: Palatino, 'Palatino Linotype', 'Book Antiqua', Georgia, serif; font-weight: 700;">Commands</h2>

<table>
<tr>
<th style="font-family: Palatino, Palatino Linotype, Georgia, serif;">Command</th>
<th style="font-family: Palatino, Palatino Linotype, Georgia, serif;">What it does</th>
</tr>
<tr>
<td style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif;"><b>Chaintrap: Rescan workspace baseline</b></td>
<td style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif;">Scan the workspace again</td>
</tr>
<tr>
<td style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif;"><b>Chaintrap: Review agent changes since last session</b></td>
<td style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif;">What appeared after this window opened</td>
</tr>
<tr>
<td style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif;"><b>Chaintrap: Acknowledge high/critical finding</b></td>
<td style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif;">Confirm you have seen a serious finding</td>
</tr>
<tr>
<td style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif;"><b>Chaintrap: Uninstall malicious package</b></td>
<td style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif;">Remove a malware pin from Dependencies or that MCP server from MCP servers</td>
</tr>
<tr>
<td style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif;"><b>Chaintrap: Open finding location</b></td>
<td style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif;">Jump to the file that pinned it</td>
</tr>
</table>

---

<h2 style="font-family: Palatino, 'Palatino Linotype', 'Book Antiqua', Georgia, serif; font-weight: 700;">Privacy</h2>

<p style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif; line-height: 1.55;">
Reads dependency and MCP files in the folders you have open. Does not run workspace code and does not upload source. Full detail: <a href="PRIVACY.md"><b>PRIVACY.md</b></a>.
</p>

---

<p style="font-family: 'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif; line-height: 1.55;">
MIT. <a href="https://github.com/pri17m/chaintrap-agent-shield">github.com/pri17m/chaintrap-agent-shield</a>
</p>
