export type LockedPackage = { name: string; version: string };

/** npm lock v2/v3 `packages` key → registry name. Nested transitives use the last node_modules segment. */
export function npmNameFromPackagesKey(pkgPath: string): string | null {
  if (!pkgPath) {
    return null;
  }
  const idx = pkgPath.lastIndexOf("node_modules/");
  if (idx < 0) {
    return null;
  }
  const rest = pkgPath.slice(idx + "node_modules/".length).replace(/\/+$/, "");
  return rest ? rest.toLowerCase() : null;
}

type NpmV1Dep = { version?: string; dependencies?: Record<string, NpmV1Dep> };

export function walkNpmV1Dependencies(
  deps: Record<string, NpmV1Dep> | undefined,
  out: LockedPackage[] = [],
): LockedPackage[] {
  if (!deps) {
    return out;
  }
  for (const [name, meta] of Object.entries(deps)) {
    const version = (meta?.version || "").trim();
    if (name && version) {
      out.push({ name: name.toLowerCase(), version });
    }
    walkNpmV1Dependencies(meta?.dependencies, out);
  }
  return out;
}

export function parsePackageLockJson(raw: string): LockedPackage[] {
  const doc = JSON.parse(raw) as {
    packages?: Record<string, { version?: string }>;
    dependencies?: Record<string, NpmV1Dep>;
  };
  const fromPackages: LockedPackage[] = [];
  for (const [pkgPath, meta] of Object.entries(doc.packages || {})) {
    const name = npmNameFromPackagesKey(pkgPath);
    if (!name) {
      continue;
    }
    fromPackages.push({ name, version: (meta.version || "").trim() || "unknown" });
  }
  if (fromPackages.length) {
    return fromPackages;
  }
  return walkNpmV1Dependencies(doc.dependencies);
}

/** Extract name@version from pnpm packages keys like `/lodash@4.17.21` or `@scope/pkg@1.0.0`. */
export function parsePnpmPackageKey(key: string): LockedPackage | null {
  const k = key.trim().replace(/^['"]|['"]$/g, "");
  if (!k || k === "." || k.startsWith("file:")) {
    return null;
  }
  const body = k.startsWith("/") ? k.slice(1) : k;
  if (body.startsWith("@")) {
    const idx = body.lastIndexOf("@");
    if (idx <= 0) {
      return null;
    }
    return { name: body.slice(0, idx).toLowerCase(), version: body.slice(idx + 1) || "unknown" };
  }
  const idx = body.lastIndexOf("@");
  if (idx <= 0) {
    return null;
  }
  return { name: body.slice(0, idx).toLowerCase(), version: body.slice(idx + 1) || "unknown" };
}

export function parsePnpmLockBody(raw: string): LockedPackage[] {
  const packagesIdx = raw.search(/^packages:\s*$/m);
  if (packagesIdx < 0) {
    return [];
  }
  const section = raw.slice(packagesIdx);
  const keyRe = /^\s{2}('([^']+)'|"([^"]+)"|(\/[^\s:]+|[^\s:][^:]*)):\s*$/gm;
  const out: LockedPackage[] = [];
  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(section))) {
    const key = m[2] || m[3] || m[4] || "";
    const parsed = parsePnpmPackageKey(key);
    if (parsed) {
      out.push(parsed);
    }
  }
  return out;
}

export function isYarnBerryLock(raw: string): boolean {
  return /^__metadata:\s*$/m.test(raw) || /^\s+resolution:\s+"/m.test(raw);
}

function yarnBerryNameFromDescriptor(descriptor: string): string | null {
  const d = descriptor.replace(/^["']|["']$/g, "").trim();
  if (!d || d.startsWith("__metadata")) {
    return null;
  }
  for (const marker of ["@npm:", "@workspace:", "@patch:", "@file:", "@link:", "@portal:"]) {
    const idx = d.indexOf(marker);
    if (idx > 0) {
      if (marker !== "@npm:") {
        return null;
      }
      return d.slice(0, idx).toLowerCase();
    }
  }
  const at = d.startsWith("@") ? d.lastIndexOf("@") : d.indexOf("@");
  if (at <= 0) {
    return null;
  }
  return d.slice(0, at).toLowerCase();
}

export function parseYarnBerryLockBody(raw: string): LockedPackage[] {
  const out: LockedPackage[] = [];
  const lines = raw.split(/\r?\n/);
  let pending: string | null = null;
  for (const line of lines) {
    const header = line.match(/^"([^"]+)":\s*$/);
    if (header && !line.startsWith(" ")) {
      pending = yarnBerryNameFromDescriptor(header[1]);
      continue;
    }
    const ver = line.match(/^\s+version:\s+(.+?)\s*$/);
    if (ver && pending) {
      const version = ver[1].replace(/^["']|["']$/g, "").trim();
      if (version) {
        out.push({ name: pending, version });
      }
      pending = null;
    }
  }
  return out;
}

/** Yarn classic lock: `name@version:` then `  version "x.y.z"`. */
export function parseYarnClassicLockBody(raw: string): LockedPackage[] {
  const out: LockedPackage[] = [];
  const lines = raw.split(/\r?\n/);
  let pendingNames: string[] = [];
  for (const line of lines) {
    if (!line.trim() || line.startsWith("#")) {
      continue;
    }
    const header = line.match(/^"?(@?[^@\s"]+)@[^:]+:"?\s*$/);
    if (header && !line.startsWith(" ")) {
      pendingNames = line
        .replace(/:$/, "")
        .split(",")
        .map((part) => {
          const p = part.trim().replace(/^"|"$/g, "");
          const at = p.startsWith("@") ? p.lastIndexOf("@") : p.indexOf("@");
          return at > 0 ? p.slice(0, at).toLowerCase() : "";
        })
        .filter(Boolean);
      continue;
    }
    const ver = line.match(/^\s+version\s+"([^"]+)"/);
    if (ver && pendingNames.length) {
      for (const name of pendingNames) {
        out.push({ name, version: ver[1] });
      }
      pendingNames = [];
    }
  }
  return out;
}

export function parseYarnLockBody(raw: string): LockedPackage[] {
  return isYarnBerryLock(raw) ? parseYarnBerryLockBody(raw) : parseYarnClassicLockBody(raw);
}

export function parseTomlPackageTables(raw: string): LockedPackage[] {
  const chunks = raw.split(/^\[\[package\]\]\s*$/m).slice(1);
  const out: LockedPackage[] = [];
  for (const chunk of chunks) {
    const name = chunk.match(/^name\s*=\s*"([^"]+)"/m);
    const version = chunk.match(/^version\s*=\s*"([^"]+)"/m);
    if (name && version) {
      out.push({
        name: name[1].toLowerCase().replace(/_/g, "-"),
        version: version[1].trim() || "unknown",
      });
    }
  }
  return out;
}

export function parsePipfileLockJson(raw: string): LockedPackage[] {
  const doc = JSON.parse(raw) as Record<string, Record<string, { version?: string }> | unknown>;
  const out: LockedPackage[] = [];
  for (const section of ["default", "develop"]) {
    const block = doc[section];
    if (!block || typeof block !== "object" || Array.isArray(block)) {
      continue;
    }
    for (const [name, meta] of Object.entries(block as Record<string, { version?: string }>)) {
      const spec = (meta?.version || "").trim();
      const version = spec.replace(/^==/, "").trim() || "unknown";
      if (name) {
        out.push({ name: name.toLowerCase().replace(/_/g, "-"), version });
      }
    }
  }
  return out;
}
