import { inferredFromMcpServer, parseMcpConfigJson } from "../scanners/mcpParser";
import { stringifyMcpConfig } from "./uninstall";

/** Exact version token we will write into mcp.json. No dist-tags, ranges, or URLs. */
export function isPinVersion(raw: string): boolean {
  const v = raw.trim();
  return /^[0-9][A-Za-z0-9._+-]{0,63}$/.test(v);
}

function packageNameFromNpmToken(token: string): string | undefined {
  const t = token.trim();
  if (!t || t.startsWith("-") || t === ".") {
    return undefined;
  }
  if (t.startsWith("@")) {
    const idx = t.lastIndexOf("@");
    return (idx > 0 ? t.slice(0, idx) : t).trim().toLowerCase();
  }
  const idx = t.indexOf("@");
  return (idx > 0 ? t.slice(0, idx) : t).trim().toLowerCase();
}

export function pinNpmSpecToken(token: string, packageName: string, version: string): string {
  const want = packageName.trim().toLowerCase();
  const name = packageNameFromNpmToken(token);
  if (!name || name !== want) {
    return token;
  }
  const original = token.trim();
  if (original.startsWith("@")) {
    const idx = original.lastIndexOf("@");
    const pkg = idx > 0 ? original.slice(0, idx) : original;
    return `${pkg}@${version}`;
  }
  const idx = original.indexOf("@");
  const pkg = idx > 0 ? original.slice(0, idx) : original;
  return `${pkg}@${version}`;
}

export function pinNpmArgs(args: unknown[], packageName: string, version: string): { args: unknown[]; changed: boolean } {
  let changed = false;
  const next = args.map((a) => {
    if (typeof a !== "string") {
      return a;
    }
    const pinned = pinNpmSpecToken(a, packageName, version);
    if (pinned !== a) {
      changed = true;
    }
    return pinned;
  });
  return { args: next, changed };
}

export function pinMcpServerById(
  raw: string,
  mcpId: string,
  version: string,
): { next: string; pinned: boolean; packageName?: string; ecosystem?: string } {
  if (!isPinVersion(version)) {
    return { next: raw, pinned: false };
  }
  const doc = JSON.parse(raw) as Record<string, unknown>;
  const want = mcpId.trim();
  let pinned = false;
  let packageName: string | undefined;
  let ecosystem: string | undefined;

  const pinMap = (servers: Record<string, unknown>): Record<string, unknown> => {
    const next: Record<string, unknown> = {};
    for (const [id, value] of Object.entries(servers)) {
      if (id !== want || !value || typeof value !== "object" || Array.isArray(value)) {
        next[id] = value;
        continue;
      }
      const parsed = parseMcpConfigJson(JSON.stringify({ mcpServers: { [id]: value } }))[0];
      const inferred = parsed ? inferredFromMcpServer(parsed) : null;
      if (!inferred || inferred.ecosystem !== "npm") {
        next[id] = value;
        continue;
      }
      const row = value as Record<string, unknown>;
      const args = parsed.args;
      const result = pinNpmArgs(args, inferred.name, version.trim());
      if (!result.changed) {
        next[id] = value;
        continue;
      }
      next[id] = { ...row, args: result.args };
      pinned = true;
      packageName = inferred.name;
      ecosystem = inferred.ecosystem;
    }
    return next;
  };

  if (doc.mcpServers && typeof doc.mcpServers === "object") {
    doc.mcpServers = pinMap(doc.mcpServers as Record<string, unknown>);
  }
  const mcp = doc.mcp;
  if (mcp && typeof mcp === "object") {
    const m = mcp as Record<string, unknown>;
    if (m.servers && typeof m.servers === "object") {
      m.servers = pinMap(m.servers as Record<string, unknown>);
    }
  }
  return { next: pinned ? stringifyMcpConfig(doc) : raw, pinned, packageName, ecosystem };
}
