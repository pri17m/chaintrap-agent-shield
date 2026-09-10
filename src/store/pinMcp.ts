import { inferredFromMcpServer, parseMcpConfigJson } from "../scanners/mcpParser";
import type { Finding } from "../types";
import { pinPackageTokenInMcpServer } from "./mcpJsonEdit";
import { stringifyMcpConfig } from "./uninstall";

/** Exact version token we will write into mcp.json. Allows Go v-prefix. No dist-tags, ranges, or URLs. */
export function isPinVersion(raw: string): boolean {
  const v = raw.trim();
  if (!v || v.toLowerCase() === "latest" || v === "*" || /^[><=^~]/.test(v)) {
    return false;
  }
  return /^v?[0-9][A-Za-z0-9._+-]{0,63}$/.test(v);
}

/** Prefer the version already resolved during scan; never a dist-tag. */
export function suggestedPinVersion(finding: Finding): string | undefined {
  const resolved = finding.resolvedVersion?.trim();
  return resolved && isPinVersion(resolved) ? resolved : undefined;
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

export function pinPypiSpecToken(token: string, packageName: string, version: string): string {
  const want = packageName.trim().toLowerCase().replace(/_/g, "-");
  const t = token.trim();
  const eq = t.match(/^([A-Za-z0-9_.-]+)==(.+)$/);
  const name = (eq ? eq[1] : t).toLowerCase().replace(/_/g, "-");
  if (name !== want) {
    return token;
  }
  return `${eq ? eq[1] : t.split("==")[0]}==${version}`;
}

export function pinGoSpecToken(token: string, packageName: string, version: string): string {
  const t = token.trim();
  const at = t.lastIndexOf("@");
  const mod = at > 0 ? t.slice(0, at) : t;
  if (mod !== packageName) {
    return token;
  }
  const ver = version.startsWith("v") || !/^\d/.test(version) ? version : `v${version}`;
  return `${mod}@${ver}`;
}

export function pinCargoSpecToken(token: string, packageName: string, version: string): string {
  const t = token.trim();
  const at = t.lastIndexOf("@");
  const name = at > 0 ? t.slice(0, at) : t;
  if (name !== packageName) {
    return token;
  }
  return `${name}@${version}`;
}

export function pinCargoArgs(args: unknown[], packageName: string, version: string): { args: unknown[]; changed: boolean } {
  let changed = false;
  const next = args.map((a, i, arr) => {
    if (typeof a !== "string") {
      return a;
    }
    const prev = i > 0 ? String(arr[i - 1]) : "";
    if ((prev === "--version" || prev === "-V") && /^[0-9v]/.test(a)) {
      changed = true;
      return version;
    }
    const pinned = pinCargoSpecToken(a, packageName, version);
    if (pinned !== a) {
      changed = true;
    }
    return pinned;
  });
  if (!changed) {
    let sawName = false;
    const withFlag: unknown[] = [];
    for (const a of next) {
      withFlag.push(a);
      if (typeof a === "string" && a === packageName) {
        sawName = true;
        withFlag.push("--version", version);
        changed = true;
      }
    }
    if (sawName && changed) {
      return { args: withFlag, changed: true };
    }
  }
  return { args: next, changed };
}

function pinArgsWith(
  args: unknown[],
  packageName: string,
  version: string,
  pinToken: (token: string, packageName: string, version: string) => string,
): { args: unknown[]; changed: boolean } {
  let changed = false;
  const next = args.map((a) => {
    if (typeof a !== "string") {
      return a;
    }
    const pinned = pinToken(a, packageName, version);
    if (pinned !== a) {
      changed = true;
    }
    return pinned;
  });
  return { args: next, changed };
}

export function pinNpmArgs(args: unknown[], packageName: string, version: string): { args: unknown[]; changed: boolean } {
  return pinArgsWith(args, packageName, version, pinNpmSpecToken);
}

export function pinMcpServerById(
  raw: string,
  mcpId: string,
  version: string,
): { next: string; pinned: boolean; packageName?: string; ecosystem?: string } {
  if (!isPinVersion(version)) {
    return { next: raw, pinned: false };
  }
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { next: raw, pinned: false };
  }
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
      if (!inferred || !["npm", "pypi", "go", "crates"].includes(inferred.ecosystem)) {
        next[id] = value;
        continue;
      }
      if (inferred.ecosystem === "pypi") {
        const line = [parsed.command, ...parsed.args.map((a) => String(a))].join(" ").toLowerCase();
        const hasEq = parsed.args.some((a) => typeof a === "string" && /^[A-Za-z0-9_.-]+==/.test(a.trim()));
        if (!line.includes("uvx") && !line.includes("pipx") && !hasEq) {
          next[id] = value;
          continue;
        }
      }
      const row = value as Record<string, unknown>;
      let result: { args: unknown[]; changed: boolean };
      if (inferred.ecosystem === "crates") {
        result = pinCargoArgs(parsed.args, inferred.name, version.trim());
      } else {
        const pinToken =
          inferred.ecosystem === "pypi"
            ? pinPypiSpecToken
            : inferred.ecosystem === "go"
              ? pinGoSpecToken
              : pinNpmSpecToken;
        result = pinArgsWith(parsed.args, inferred.name, version.trim(), pinToken);
      }
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
  if (!pinned || !packageName) {
    return { next: raw, pinned: false, packageName, ecosystem };
  }
  try {
    const surgical = pinPackageTokenInMcpServer(
      raw,
      want,
      packageName,
      version.trim(),
      ecosystem === "pypi"
        ? pinPypiSpecToken
        : ecosystem === "go"
          ? pinGoSpecToken
          : ecosystem === "crates"
            ? pinCargoSpecToken
            : pinNpmSpecToken,
    );
    if (surgical.pinned) {
      return { next: surgical.next, pinned: true, packageName, ecosystem };
    }
  } catch {
    /* fall back to re-stringifying */
  }
  return { next: stringifyMcpConfig(doc), pinned: true, packageName, ecosystem };
}
