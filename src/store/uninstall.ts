import type { Finding } from "../types";
import { inferredFromMcpServer, parseMcpConfigJson } from "../scanners/mcpParser";
import { applyJsonIndent, removeMcpServerEntry } from "./mcpJsonEdit";

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
  return applyJsonIndent(doc, raw);
}

/** Remove mcpServers / mcp.servers entries whose inferred package matches. */
export function removeMcpServerByPackage(raw: string, packageName: string): { next: string; removed: string[] } {
  const want = packageName.trim().toLowerCase();
  return stripMcpServers(raw, (_id, inferredName) => inferredName === want);
}

/** Remove a single mcpServers / mcp.servers entry by server id. */
export function removeMcpServerById(raw: string, mcpId: string): { next: string; removed: string[] } {
  const want = mcpId.trim();
  return stripMcpServers(raw, (id) => id === want);
}

function stripMcpServers(
  raw: string,
  drop: (id: string, inferredName: string | undefined) => boolean,
): { next: string; removed: string[] } {
  const doc = JSON.parse(raw) as Record<string, unknown>;
  const removed: string[] = [];
  const stripMap = (servers: Record<string, unknown>): Record<string, unknown> => {
    const next: Record<string, unknown> = {};
    for (const [id, value] of Object.entries(servers)) {
      const parsed = parseMcpConfigJson(JSON.stringify({ mcpServers: { [id]: value } }))[0];
      const inferred = parsed ? inferredFromMcpServer(parsed) : null;
      if (drop(id, inferred?.name.toLowerCase())) {
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
  if (removed.length === 0) {
    return { next: raw, removed };
  }
  let next = raw;
  for (const id of removed) {
    const cut = removeMcpServerEntry(next, id);
    if (!cut.removed) {
      return { next: stringifyMcpConfig(doc), removed };
    }
    next = cut.next;
  }
  try {
    JSON.parse(next);
    return { next, removed };
  } catch {
    return { next: stringifyMcpConfig(doc), removed };
  }
}

/** Pretty-print mcp.json; keep args arrays on one line so uninstall does not look like a syntax/indent break. */
export function stringifyMcpConfig(doc: unknown): string {
  const pretty = JSON.stringify(doc, null, 2);
  const compact = pretty.replace(/("args": )(\[[\s\S]*?\])/g, (full, prefix: string, arrSrc: string) => {
    try {
      const arr = JSON.parse(arrSrc) as unknown;
      if (!Array.isArray(arr) || !arr.every((x) => typeof x === "string")) {
        return full;
      }
      return `${prefix}${JSON.stringify(arr).replace(/","/g, '", "')}`;
    } catch {
      return full;
    }
  });
  return compact.endsWith("\n") ? compact : `${compact}\n`;
}

export function uninstallConfirmLabel(f: Finding): string {
  if (f.surface === "mcp") {
    const pin = `${f.packageName || "?"}@${f.version || "?"}`;
    return f.mcpId ? `MCP server ${f.mcpId} (${pin})` : `MCP ${pin}`;
  }
  const eco = f.ecosystem === "pypi" ? "PyPI" : "npm";
  return `${eco} ${f.packageName || "?"}@${f.version || "?"}`;
}
