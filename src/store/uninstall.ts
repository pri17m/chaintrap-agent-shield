import type { Finding } from "../types";
import { inferredFromMcpServer, parseMcpConfigJson } from "../scanners/mcpParser";

/** Drop requirement lines whose package name matches (case-insensitive). */
export function stripRequirementsLine(raw: string, packageName: string): string {
  const want = packageName.trim().toLowerCase();
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("-")) {
      out.push(line);
      continue;
    }
    const name = t.split(/[=<>!~\s[]/)[0]?.trim().toLowerCase() || "";
    if (name === want) {
      continue;
    }
    out.push(line);
  }
  return out.join("\n").replace(/\n+$/, "\n");
}

export function removePackageJsonDependency(raw: string, packageName: string): string {
  const doc = JSON.parse(raw) as Record<string, unknown>;
  const sections = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
  for (const key of sections) {
    const block = doc[key];
    if (block && typeof block === "object" && !Array.isArray(block)) {
      delete (block as Record<string, unknown>)[packageName];
    }
  }
  return JSON.stringify(doc, null, 2) + "\n";
}

/** Remove mcpServers / mcp.servers entries whose inferred package matches. */
export function removeMcpServerByPackage(raw: string, packageName: string): { next: string; removed: string[] } {
  const want = packageName.trim().toLowerCase();
  const doc = JSON.parse(raw) as Record<string, unknown>;
  const removed: string[] = [];
  const stripMap = (servers: Record<string, unknown>): Record<string, unknown> => {
    const next: Record<string, unknown> = {};
    for (const [id, value] of Object.entries(servers)) {
      const parsed = parseMcpConfigJson(JSON.stringify({ mcpServers: { [id]: value } }))[0];
      const inferred = parsed ? inferredFromMcpServer(parsed) : null;
      if (inferred && inferred.name.toLowerCase() === want) {
        removed.push(id);
        continue;
      }
      next[id] = value;
    }
    return next;
  };
  if (doc.mcpServers && typeof doc.mcpServers === "object") {
    doc.mcpServers = stripMap(doc.mcpServers as Record<string, unknown>);
  }
  const mcp = doc.mcp;
  if (mcp && typeof mcp === "object") {
    const m = mcp as Record<string, unknown>;
    if (m.servers && typeof m.servers === "object") {
      m.servers = stripMap(m.servers as Record<string, unknown>);
    }
  }
  return { next: JSON.stringify(doc, null, 2) + "\n", removed };
}

export function uninstallConfirmLabel(f: Finding): string {
  const eco = f.ecosystem === "pypi" ? "PyPI" : f.surface === "mcp" ? "MCP" : "npm";
  return `${eco} ${f.packageName || "?"}@${f.version || "?"}`;
}
