import type { LockedPackage } from "./lockfileParsers";

function stripCommentsXml(raw: string): string {
  return raw.replace(/<!--[\s\S]*?-->/g, "");
}

function firstTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>\\s*([^<]+)\\s*</${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

export function parsePomXml(raw: string): LockedPackage[] {
  const body = stripCommentsXml(raw);
  const out: LockedPackage[] = [];
  const re = /<dependency>([\s\S]*?)<\/dependency>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const group = firstTag(m[1], "groupId");
    const artifact = firstTag(m[1], "artifactId");
    const version = firstTag(m[1], "version");
    if (!group || !artifact) {
      continue;
    }
    out.push({
      name: `${group}:${artifact}`,
      version: version && !version.includes("${") ? version : "unknown",
    });
  }
  return out;
}

export function parseGradleLockfile(raw: string): LockedPackage[] {
  const out: LockedPackage[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("empty=")) {
      continue;
    }
    const m = t.match(/^([^:=\s]+):([^:=\s]+):([^:=\s]+)=/);
    if (m) {
      out.push({ name: `${m[1]}:${m[2]}`, version: m[3] });
    }
  }
  return out;
}

export function parseGradleVerificationMetadata(raw: string): LockedPackage[] {
  const body = stripCommentsXml(raw);
  const out: LockedPackage[] = [];
  const re = /<component\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const attrs = m[1];
    const group = attrs.match(/\bgroup="([^"]+)"/i)?.[1];
    const name = attrs.match(/\bname="([^"]+)"/i)?.[1];
    const version = attrs.match(/\bversion="([^"]+)"/i)?.[1];
    if (group && name && version) {
      out.push({ name: `${group}:${name}`, version });
    }
  }
  return out;
}

export function parseGoMod(raw: string): LockedPackage[] {
  const out: LockedPackage[] = [];
  const lines = raw.split(/\r?\n/);
  let inRequire = false;
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("//")) {
      continue;
    }
    if (/^require\s+\(/.test(t)) {
      inRequire = true;
      continue;
    }
    if (inRequire && t === ")") {
      inRequire = false;
      continue;
    }
    const one = t.match(/^require\s+(\S+)\s+(\S+)/);
    if (one) {
      out.push({ name: one[1], version: one[2] });
      continue;
    }
    if (inRequire) {
      const inner = t.match(/^(\S+)\s+(\S+)/);
      if (inner) {
        out.push({ name: inner[1], version: inner[2] });
      }
    }
  }
  return out;
}

export function parseGoSum(raw: string): LockedPackage[] {
  const seen = new Set<string>();
  const out: LockedPackage[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) {
      continue;
    }
    const name = parts[0];
    let version = parts[1];
    if (version.endsWith("/go.mod")) {
      version = version.slice(0, -"/go.mod".length);
    }
    const key = `${name}@${version}`;
    if (!name || !version || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({ name, version });
  }
  return out;
}

export function parseCargoToml(raw: string): LockedPackage[] {
  const out: LockedPackage[] = [];
  const sections = raw.split(/^\[([^\]]+)\]\s*$/m);
  for (let i = 1; i < sections.length; i += 2) {
    const header = (sections[i] || "").trim().toLowerCase();
    if (!/^(dependencies|dev-dependencies|build-dependencies|workspace\.dependencies)$/.test(header)) {
      continue;
    }
    const body = sections[i + 1] || "";
    for (const line of body.split(/\r?\n/)) {
      const simple = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"\s*$/);
      if (simple) {
        out.push({ name: simple[1], version: simple[2] });
        continue;
      }
      const table = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*\{[^}]*version\s*=\s*"([^"]+)"/);
      if (table) {
        out.push({ name: table[1], version: table[2] });
      }
    }
  }
  return out;
}

export function parseCargoLock(raw: string): LockedPackage[] {
  const chunks = raw.split(/^\[\[package\]\]\s*$/m).slice(1);
  const out: LockedPackage[] = [];
  for (const chunk of chunks) {
    const name = chunk.match(/^name\s*=\s*"([^"]+)"/m);
    const version = chunk.match(/^version\s*=\s*"([^"]+)"/m);
    if (name && version) {
      out.push({ name: name[1], version: version[1].trim() || "unknown" });
    }
  }
  return out;
}

function stripJsonc(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1");
}

export function parseBunLockBody(raw: string): LockedPackage[] {
  let doc: unknown;
  try {
    doc = JSON.parse(stripJsonc(raw));
  } catch {
    return [];
  }
  if (!doc || typeof doc !== "object") {
    return [];
  }
  const packages = (doc as { packages?: Record<string, unknown> }).packages;
  if (!packages || typeof packages !== "object") {
    return [];
  }
  const out: LockedPackage[] = [];
  for (const [key, value] of Object.entries(packages)) {
    if (Array.isArray(value) && typeof value[0] === "string") {
      const spec = value[0];
      const at = spec.startsWith("@") ? spec.lastIndexOf("@") : spec.indexOf("@");
      if (at > 0) {
        out.push({ name: spec.slice(0, at), version: spec.slice(at + 1) || "unknown" });
        continue;
      }
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const version = String((value as { version?: unknown }).version || "").trim();
      const name = key.replace(/@[^@]+$/, "") || key;
      if (version) {
        out.push({ name, version });
      }
    }
  }
  return out;
}

function parseQuotedDepList(block: string): string[] {
  const out: string[] = [];
  const re = /["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    out.push(m[1]);
  }
  return out;
}

export function parsePyprojectToml(raw: string): LockedPackage[] {
  const out: LockedPackage[] = [];
  const pep = raw.match(/\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/);
  if (pep) {
    for (const spec of parseQuotedDepList(pep[1])) {
      const exact = spec.match(/^([A-Za-z0-9_.-]+)\s*==\s*([^\s;#]+)/);
      if (exact) {
        out.push({ name: exact[1], version: exact[2] });
      } else {
        const name = spec.split(/[=<>!~\s[]/)[0]?.trim();
        if (name) {
          out.push({ name, version: "unknown" });
        }
      }
    }
  }
  const poetry = raw.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(?:\n\[|\s*$)/);
  if (poetry) {
    for (const line of poetry[1].split(/\r?\n/)) {
      const nameVer = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*"([^"]+)"\s*$/);
      if (nameVer && nameVer[1].toLowerCase() !== "python") {
        out.push({ name: nameVer[1], version: nameVer[2] });
        continue;
      }
      const table = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*\{[^}]*version\s*=\s*"([^"]+)"/);
      if (table && table[1].toLowerCase() !== "python") {
        out.push({ name: table[1], version: table[2] });
      }
    }
  }
  return out;
}

export function parsePdmOrPylock(raw: string): LockedPackage[] {
  const chunks = raw.split(/^\[\[packages?\]\]\s*$/m).slice(1);
  const out: LockedPackage[] = [];
  for (const chunk of chunks) {
    const name = chunk.match(/^name\s*=\s*"([^"]+)"/m);
    const version = chunk.match(/^version\s*=\s*"([^"]+)"/m);
    if (name && version) {
      out.push({ name: name[1], version: version[1].trim() || "unknown" });
    }
  }
  if (out.length) {
    return out;
  }
  return parseCargoLock(raw);
}

export function parseGemfileLock(raw: string): LockedPackage[] {
  const out: LockedPackage[] = [];
  let inSpecs = false;
  for (const line of raw.split(/\r?\n/)) {
    if (/^\s*specs:\s*$/.test(line)) {
      inSpecs = true;
      continue;
    }
    if (inSpecs && /^\S/.test(line) && !line.startsWith(" ")) {
      inSpecs = false;
    }
    if (!inSpecs) {
      continue;
    }
    const m = line.match(/^ {4}([A-Za-z0-9_-]+) \(([^)]+)\)\s*$/);
    if (m) {
      out.push({ name: m[1], version: m[2].trim() });
    }
  }
  return out;
}

/** Exact `gem "name", "1.2.3"` pins. Unversioned gems are unknown. */
export function parseGemfileExact(raw: string): LockedPackage[] {
  const out: LockedPackage[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) {
      continue;
    }
    const exact = t.match(/^gem\s+["']([^"']+)["']\s*,\s*["']([^"']+)["']/);
    if (exact) {
      out.push({ name: exact[1], version: exact[2] });
      continue;
    }
    const nameOnly = t.match(/^gem\s+["']([^"']+)["']/);
    if (nameOnly) {
      out.push({ name: nameOnly[1], version: "unknown" });
    }
  }
  return out;
}

export function parseNugetPackagesLock(raw: string): LockedPackage[] {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return [];
  }
  const deps = (doc as { dependencies?: Record<string, Record<string, { resolved?: string }>> }).dependencies;
  if (!deps || typeof deps !== "object") {
    return [];
  }
  const seen = new Set<string>();
  const out: LockedPackage[] = [];
  for (const framework of Object.values(deps)) {
    if (!framework || typeof framework !== "object") {
      continue;
    }
    for (const [name, meta] of Object.entries(framework)) {
      const version = (meta?.resolved || "").trim();
      const key = `${name.toLowerCase()}@${version}`;
      if (!version || seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push({ name, version });
    }
  }
  return out;
}

export function parsePackagesConfig(raw: string): LockedPackage[] {
  const body = stripCommentsXml(raw);
  const out: LockedPackage[] = [];
  const re = /<package\b([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const id = m[1].match(/\bid="([^"]+)"/i)?.[1];
    const version = m[1].match(/\bversion="([^"]+)"/i)?.[1];
    if (id && version) {
      out.push({ name: id, version });
    }
  }
  return out;
}

export function parseDepsJson(raw: string): LockedPackage[] {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return [];
  }
  const libraries = (doc as { libraries?: Record<string, { type?: string }> }).libraries;
  if (!libraries || typeof libraries !== "object") {
    return [];
  }
  const out: LockedPackage[] = [];
  for (const [key, meta] of Object.entries(libraries)) {
    if (meta?.type && meta.type !== "package") {
      continue;
    }
    const slash = key.lastIndexOf("/");
    if (slash <= 0) {
      continue;
    }
    out.push({ name: key.slice(0, slash), version: key.slice(slash + 1) });
  }
  return out;
}

export function parseComposerLock(raw: string): LockedPackage[] {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return [];
  }
  const out: LockedPackage[] = [];
  const obj = doc as { packages?: Array<{ name?: string; version?: string }>; "packages-dev"?: Array<{ name?: string; version?: string }> };
  for (const list of [obj.packages, obj["packages-dev"]]) {
    if (!Array.isArray(list)) {
      continue;
    }
    for (const p of list) {
      if (p?.name && p.version) {
        out.push({ name: p.name, version: String(p.version).replace(/^v/i, "") });
      }
    }
  }
  return out;
}

export function parseGithubWorkflowUses(raw: string): LockedPackage[] {
  const out: LockedPackage[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:-\s*)?uses:\s*['"]?([^'"\s]+)['"]?/);
    if (!m) {
      continue;
    }
    const spec = m[1].trim();
    if (!spec || spec.startsWith("docker://") || spec.startsWith("./") || spec.startsWith(".\\")) {
      continue;
    }
    const at = spec.lastIndexOf("@");
    if (at <= 0) {
      out.push({ name: spec, version: "unknown" });
      continue;
    }
    out.push({ name: spec.slice(0, at), version: spec.slice(at + 1) });
  }
  return out;
}

export function parsePubspecLock(raw: string): LockedPackage[] {
  const out: LockedPackage[] = [];
  let current: string | null = null;
  let inPackages = false;
  for (const line of raw.split(/\r?\n/)) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages && /^\S/.test(line) && !line.startsWith(" ")) {
      inPackages = false;
    }
    if (!inPackages) {
      continue;
    }
    const name = line.match(/^ {2}([A-Za-z0-9_]+):\s*$/);
    if (name) {
      current = name[1];
      continue;
    }
    const ver = line.match(/^\s+version:\s+"?([^"\s]+)"?\s*$/);
    if (ver && current) {
      out.push({ name: current, version: ver[1] });
      current = null;
    }
  }
  return out;
}

export function parseMixLock(raw: string): LockedPackage[] {
  const out: LockedPackage[] = [];
  const re = /"([^"]+)":\s*\{:hex,\s*:[^,]+,\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    out.push({ name: m[1], version: m[2] });
  }
  return out;
}

export function parsePackageResolved(raw: string): LockedPackage[] {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return [];
  }
  const obj = doc as {
    pins?: Array<{ identity?: string; location?: string; state?: { version?: string } }>;
    object?: { pins?: Array<{ package?: string; repositoryURL?: string; state?: { version?: string } }> };
  };
  const out: LockedPackage[] = [];
  if (Array.isArray(obj.pins)) {
    for (const p of obj.pins) {
      const name = p.location || p.identity;
      const version = p.state?.version;
      if (name && version) {
        out.push({ name, version });
      }
    }
  }
  if (Array.isArray(obj.object?.pins)) {
    for (const p of obj.object.pins) {
      const name = p.repositoryURL || p.package;
      const version = p.state?.version;
      if (name && version) {
        out.push({ name, version });
      }
    }
  }
  return out;
}

export function parseCabalFreeze(raw: string): LockedPackage[] {
  const out: LockedPackage[] = [];
  const body = raw.replace(/^constraints:\s*/im, "").replace(/\n/g, " ");
  const re = /([A-Za-z0-9_-]+)\s*==\s*([0-9][0-9A-Za-z.-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    out.push({ name: m[1], version: m[2] });
  }
  return out;
}

export function parseRenvLock(raw: string): LockedPackage[] {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return [];
  }
  const packages = (doc as { Packages?: Record<string, { Package?: string; Version?: string }> }).Packages;
  if (!packages || typeof packages !== "object") {
    return [];
  }
  const out: LockedPackage[] = [];
  for (const meta of Object.values(packages)) {
    const name = meta?.Package;
    const version = meta?.Version;
    if (name && version) {
      out.push({ name, version });
    }
  }
  return out;
}

export function parseConanLock(raw: string): LockedPackage[] {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return [];
  }
  const out: LockedPackage[] = [];
  const requires = (doc as { requires?: unknown }).requires;
  if (Array.isArray(requires)) {
    for (const r of requires) {
      const s = String(r);
      const m = s.match(/^([^/@]+)\/([^/@]+)/);
      if (m) {
        out.push({ name: m[1], version: m[2] });
      }
    }
  }
  const nodes = (doc as { graph?: { nodes?: Record<string, { ref?: string }> } }).graph?.nodes;
  if (nodes && typeof nodes === "object") {
    for (const n of Object.values(nodes)) {
      const ref = n?.ref || "";
      const m = ref.match(/^([^/@]+)\/([^/@]+)/);
      if (m) {
        out.push({ name: m[1], version: m[2] });
      }
    }
  }
  return out;
}

export function parseStackYamlLock(raw: string): LockedPackage[] {
  const out: LockedPackage[] = [];
  const re = /name:\s*([A-Za-z0-9_-]+)[\s\S]{0,80}?version:\s*["']?([0-9][0-9A-Za-z.-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    out.push({ name: m[1], version: m[2] });
  }
  return out;
}
