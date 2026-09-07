import * as fs from "fs";
import * as path from "path";
import {
  parseCabalFreeze,
  parseCargoToml,
  parseConanLock,
  parseGemfileExact,
  parseGithubWorkflowUses,
  parseGoMod,
  parseNugetPackagesLock,
  parsePackagesConfig,
  parsePomXml,
  parsePyprojectToml,
  parseRenvLock,
} from "../scanners/ecoParsers";
import { isHashedLockPath, isWritableEcosystem, siblingManifestNames } from "../scanners/ecosystems";
import type { Ecosystem, Finding } from "../types";
import { pinPackageJsonDependency, pinRequirementVersion } from "./pinManifest";
import { removePackageJsonDependency, stripRequirementsLine } from "./uninstall";

export interface ManifestFixAction {
  kind: "delete" | "pin" | "skip";
  finding: Finding;
  version?: string;
}

function baseName(filePath: string): string {
  return path.basename(filePath).toLowerCase();
}

function namesEqual(eco: Ecosystem, a: string, b: string): boolean {
  if (eco === "nuget" || eco === "maven" || eco === "go" || eco === "swift") {
    return a === b;
  }
  if (eco === "pypi" || eco === "rubygems" || eco === "cran") {
    return a.toLowerCase().replace(/_/g, "-") === b.toLowerCase().replace(/_/g, "-");
  }
  return a.toLowerCase() === b.toLowerCase();
}

function findSibling(finding: Finding, fileName: string): string | undefined {
  if (baseName(finding.path) === fileName.toLowerCase() && fs.existsSync(finding.path)) {
    return finding.path;
  }
  const dirs = [path.dirname(finding.path), finding.workspaceRoot].filter((d): d is string => Boolean(d));
  for (const dir of dirs) {
    const p = path.join(dir, fileName);
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return undefined;
}

export function resolveWritableManifestPath(finding: Finding): string | undefined {
  if (finding.surface === "mcp") {
    return finding.path && fs.existsSync(finding.path) ? finding.path : finding.path;
  }
  const eco = finding.ecosystem;
  if (!eco || eco === "swift" || eco === "hex" || !isWritableEcosystem(eco)) {
    return undefined;
  }
  const base = baseName(finding.path);
  if (eco === "github_actions" && (base.endsWith(".yml") || base.endsWith(".yaml"))) {
    return finding.path;
  }
  const directWritable = new Set([
    "package.json",
    "requirements.txt",
    "pyproject.toml",
    "pom.xml",
    "go.mod",
    "cargo.toml",
    "gemfile",
    "packages.config",
    "packages.lock.json",
    "composer.json",
    "pubspec.yaml",
    "cabal.project.freeze",
    "renv.lock",
    "conan.lock",
  ]);
  if (directWritable.has(base)) {
    return finding.path;
  }
  for (const name of siblingManifestNames(eco)) {
    const found = findSibling(finding, name);
    if (found) {
      return found;
    }
  }
  return undefined;
}

export function skipReasonForFinding(finding: Finding): string | undefined {
  if (finding.ecosystem === "swift") {
    return "Swift Package.swift is source; not edited";
  }
  if (finding.ecosystem === "hex") {
    return "mix.exs is Elixir AST; not edited";
  }
  if (finding.ecosystem && !isWritableEcosystem(finding.ecosystem)) {
    return "no manifest writer for this ecosystem";
  }
  if (finding.surface === "mcp") {
    return undefined;
  }
  if (resolveWritableManifestPath(finding)) {
    return undefined;
  }
  if (isHashedLockPath(finding.path)) {
    return "hashed lockfile only; add a sibling manifest";
  }
  return "no writable manifest";
}

function keepIfUnchanged<T extends { name: string; version: string }>(
  before: T[],
  after: T[],
  name: string,
  eco: Ecosystem,
  expectMissing: boolean,
  newVersion?: string,
): boolean {
  const othersBefore = before.filter((p) => !namesEqual(eco, p.name, name));
  const othersAfter = after.filter((p) => !namesEqual(eco, p.name, name));
  if (othersBefore.length !== othersAfter.length) {
    return false;
  }
  const afterNames = new Set(othersAfter.map((p) => p.name + "@" + p.version));
  for (const p of othersBefore) {
    if (!afterNames.has(p.name + "@" + p.version)) {
      return false;
    }
  }
  const hit = after.find((p) => namesEqual(eco, p.name, name));
  if (expectMissing) {
    return !hit;
  }
  if (!newVersion) {
    return true;
  }
  return Boolean(hit && hit.version === newVersion);
}

export function pinPomDependency(raw: string, coord: string, version: string): { next: string; changed: boolean } {
  const colon = coord.indexOf(":");
  if (colon <= 0) {
    return { next: raw, changed: false };
  }
  const group = coord.slice(0, colon);
  const artifact = coord.slice(colon + 1);
  const re = /<dependency>([\s\S]*?)<\/dependency>/gi;
  let next = raw;
  let changed = false;
  next = raw.replace(re, (full, inner: string) => {
    const g = inner.match(/<groupId>\s*([^<]+)\s*<\/groupId>/i)?.[1]?.trim();
    const a = inner.match(/<artifactId>\s*([^<]+)\s*<\/artifactId>/i)?.[1]?.trim();
    if (g !== group || a !== artifact) {
      return full;
    }
    changed = true;
    if (/<version>[\s\S]*?<\/version>/i.test(inner)) {
      const updated = inner.replace(/<version>\s*[^<]*\s*<\/version>/i, `<version>${version}</version>`);
      return `<dependency>${updated}</dependency>`;
    }
    return `<dependency>${inner}\n      <version>${version}</version>\n    </dependency>`;
  });
  if (!changed) {
    return { next: raw, changed: false };
  }
  const before = parsePomXml(raw);
  const after = parsePomXml(next);
  if (!keepIfUnchanged(before, after, coord, "maven", false, version)) {
    return { next: raw, changed: false };
  }
  return { next, changed: true };
}

export function removePomDependency(raw: string, coord: string): { next: string; changed: boolean } {
  const colon = coord.indexOf(":");
  if (colon <= 0) {
    return { next: raw, changed: false };
  }
  const group = coord.slice(0, colon);
  const artifact = coord.slice(colon + 1);
  const re = /\s*<dependency>[\s\S]*?<\/dependency>/gi;
  const next = raw.replace(re, (full) => {
    const g = full.match(/<groupId>\s*([^<]+)\s*<\/groupId>/i)?.[1]?.trim();
    const a = full.match(/<artifactId>\s*([^<]+)\s*<\/artifactId>/i)?.[1]?.trim();
    if (g === group && a === artifact) {
      return "";
    }
    return full;
  });
  if (next === raw) {
    return { next: raw, changed: false };
  }
  const before = parsePomXml(raw);
  const after = parsePomXml(next);
  if (!keepIfUnchanged(before, after, coord, "maven", true)) {
    return { next: raw, changed: false };
  }
  return { next, changed: true };
}

export function pinGoModRequire(raw: string, module: string, version: string): { next: string; changed: boolean } {
  const nl = raw.includes("\r\n") ? "\r\n" : "\n";
  let changed = false;
  const nextLines = raw.split(/\r?\n/).map((line) => {
    const one = line.match(/^require\s+(\S+)\s+(\S+)(.*)$/);
    if (one && one[1] === module) {
      changed = true;
      return `require ${module} ${version}${one[3]}`;
    }
    const inner = line.match(/^(\s+)(\S+)(\s+)(\S+)(.*)$/);
    if (inner && inner[2] === module) {
      changed = true;
      return `${inner[1]}${module}${inner[3]}${version}${inner[5]}`;
    }
    return line;
  });
  if (!changed) {
    return { next: raw, changed: false };
  }
  const next = nextLines.join(nl);
  const before = parseGoMod(raw);
  const after = parseGoMod(next);
  if (!keepIfUnchanged(before, after, module, "go", false, version)) {
    return { next: raw, changed: false };
  }
  return { next, changed: true };
}

export function removeGoModRequire(raw: string, module: string): { next: string; changed: boolean } {
  const nl = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/).filter((line) => {
    const one = line.match(/^require\s+(\S+)\s+/);
    if (one && one[1] === module) {
      return false;
    }
    const inner = line.match(/^\s+(\S+)\s+\S+/);
    return !(inner && inner[1] === module);
  });
  const next = lines.join(nl);
  if (next === raw) {
    return { next: raw, changed: false };
  }
  const before = parseGoMod(raw);
  const after = parseGoMod(next);
  if (!keepIfUnchanged(before, after, module, "go", true)) {
    return { next: raw, changed: false };
  }
  return { next, changed: true };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function pinCargoTomlDep(raw: string, name: string, version: string): { next: string; changed: boolean } {
  const safe = escapeRegExp(name);
  const simple = new RegExp(`^(\\s*${safe}\\s*=\\s*")([^"]+)("\\s*)$`, "m");
  let next = raw;
  let changed = false;
  if (simple.test(raw)) {
    next = raw.replace(simple, `$1${version}$3`);
    changed = next !== raw;
  } else {
    const table = new RegExp(`^(\\s*${safe}\\s*=\\s*\\{[^}]*version\\s*=\\s*")([^"]+)(")`, "m");
    if (table.test(raw)) {
      next = raw.replace(table, `$1${version}$3`);
      changed = next !== raw;
    }
  }
  if (!changed) {
    return { next: raw, changed: false };
  }
  const before = parseCargoToml(raw);
  const after = parseCargoToml(next);
  if (!keepIfUnchanged(before, after, name, "crates", false, version)) {
    return { next: raw, changed: false };
  }
  return { next, changed: true };
}

export function removeCargoTomlDep(raw: string, name: string): { next: string; changed: boolean } {
  const nl = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);
  const nextLines = lines.filter((line) => !new RegExp(`^\\s*${escapeRegExp(name)}\\s*=`).test(line));
  const next = nextLines.join(nl);
  if (next === raw) {
    return { next: raw, changed: false };
  }
  const before = parseCargoToml(raw);
  const after = parseCargoToml(next);
  if (!keepIfUnchanged(before, after, name, "crates", true)) {
    return { next: raw, changed: false };
  }
  return { next, changed: true };
}

export function pinGemfileGem(raw: string, name: string, version: string): { next: string; changed: boolean } {
  const nl = raw.includes("\r\n") ? "\r\n" : "\n";
  const want = name.toLowerCase().replace(/_/g, "-");
  let changed = false;
  const lines = raw.split(/\r?\n/).map((line) => {
    const m = line.match(/^(\s*gem\s+["'])([^"']+)(["']\s*,\s*["'])([^"']+)(["'].*)$/);
    if (!m) {
      const one = line.match(/^(\s*gem\s+["'])([^"']+)(["'])(\s*)$/);
      if (one && one[2].toLowerCase().replace(/_/g, "-") === want) {
        changed = true;
        return `${one[1]}${one[2]}${one[3]}, "${version}"${one[4]}`;
      }
      return line;
    }
    if (m[2].toLowerCase().replace(/_/g, "-") !== want) {
      return line;
    }
    changed = true;
    return `${m[1]}${m[2]}${m[3]}${version}${m[5]}`;
  });
  if (!changed) {
    return { next: raw, changed: false };
  }
  const next = lines.join(nl);
  const before = parseGemfileExact(raw);
  const after = parseGemfileExact(next);
  if (!keepIfUnchanged(before, after, name, "rubygems", false, version)) {
    return { next: raw, changed: false };
  }
  return { next, changed: true };
}

export function removeGemfileGem(raw: string, name: string): { next: string; changed: boolean } {
  const nl = raw.includes("\r\n") ? "\r\n" : "\n";
  const want = name.toLowerCase().replace(/_/g, "-");
  const lines = raw.split(/\r?\n/).filter((line) => {
    const m = line.match(/^\s*gem\s+["']([^"']+)["']/);
    return !(m && m[1].toLowerCase().replace(/_/g, "-") === want);
  });
  const next = lines.join(nl);
  if (next === raw) {
    return { next: raw, changed: false };
  }
  const before = parseGemfileExact(raw);
  const after = parseGemfileExact(next);
  if (!keepIfUnchanged(before, after, name, "rubygems", true)) {
    return { next: raw, changed: false };
  }
  return { next, changed: true };
}

export function pinNugetLock(raw: string, name: string, version: string): { next: string; changed: boolean } {
  let doc: { dependencies?: Record<string, Record<string, { resolved?: string }>> };
  try {
    doc = JSON.parse(raw);
  } catch {
    return { next: raw, changed: false };
  }
  let changed = false;
  for (const framework of Object.values(doc.dependencies || {})) {
    if (!framework || typeof framework !== "object") {
      continue;
    }
    for (const [id, meta] of Object.entries(framework)) {
      if (id === name || id.toLowerCase() === name.toLowerCase()) {
        meta.resolved = version;
        changed = true;
      }
    }
  }
  if (!changed) {
    return { next: raw, changed: false };
  }
  const next = JSON.stringify(doc, null, 2) + (raw.endsWith("\n") ? "\n" : "");
  const before = parseNugetPackagesLock(raw);
  const after = parseNugetPackagesLock(next);
  if (!keepIfUnchanged(before, after, name, "nuget", false, version)) {
    return { next: raw, changed: false };
  }
  return { next, changed: true };
}

export function removeNugetLock(raw: string, name: string): { next: string; changed: boolean } {
  let doc: { dependencies?: Record<string, Record<string, unknown>> };
  try {
    doc = JSON.parse(raw);
  } catch {
    return { next: raw, changed: false };
  }
  let changed = false;
  for (const framework of Object.values(doc.dependencies || {})) {
    if (!framework || typeof framework !== "object") {
      continue;
    }
    for (const id of Object.keys(framework)) {
      if (id === name || id.toLowerCase() === name.toLowerCase()) {
        delete framework[id];
        changed = true;
      }
    }
  }
  if (!changed) {
    return { next: raw, changed: false };
  }
  const next = JSON.stringify(doc, null, 2) + (raw.endsWith("\n") ? "\n" : "");
  try {
    JSON.parse(next);
  } catch {
    return { next: raw, changed: false };
  }
  return { next, changed: true };
}

export function pinPackagesConfig(raw: string, name: string, version: string): { next: string; changed: boolean } {
  const re = /(<package\b[^>]*\bid=")([^"]+)("[^>]*\bversion=")([^"]+)(")/gi;
  let changed = false;
  const next = raw.replace(re, (full, a, id, b, _ver, c) => {
    if (id === name || id.toLowerCase() === name.toLowerCase()) {
      changed = true;
      return `${a}${id}${b}${version}${c}`;
    }
    return full;
  });
  if (!changed) {
    return { next: raw, changed: false };
  }
  const before = parsePackagesConfig(raw);
  const after = parsePackagesConfig(next);
  if (!keepIfUnchanged(before, after, name, "nuget", false, version)) {
    return { next: raw, changed: false };
  }
  return { next, changed: true };
}

export function removePackagesConfig(raw: string, name: string): { next: string; changed: boolean } {
  const re = /\s*<package\b[^>]*\/>/gi;
  const next = raw.replace(re, (full) => {
    const id = full.match(/\bid="([^"]+)"/i)?.[1];
    if (id === name || id?.toLowerCase() === name.toLowerCase()) {
      return "";
    }
    return full;
  });
  if (next === raw) {
    return { next: raw, changed: false };
  }
  const before = parsePackagesConfig(raw);
  const after = parsePackagesConfig(next);
  if (!keepIfUnchanged(before, after, name, "nuget", true)) {
    return { next: raw, changed: false };
  }
  return { next, changed: true };
}

export function pinComposerJson(raw: string, name: string, version: string): { next: string; changed: boolean } {
  let doc: { require?: Record<string, string>; "require-dev"?: Record<string, string> };
  try {
    doc = JSON.parse(raw);
  } catch {
    return { next: raw, changed: false };
  }
  let changed = false;
  for (const key of ["require", "require-dev"] as const) {
    const block = doc[key];
    if (block && name in block) {
      block[name] = version;
      changed = true;
    }
  }
  if (!changed) {
    return { next: raw, changed: false };
  }
  try {
    const next = JSON.stringify(doc, null, 4) + (raw.endsWith("\n") ? "\n" : "");
    JSON.parse(next);
    return { next, changed: true };
  } catch {
    return { next: raw, changed: false };
  }
}

export function removeComposerJson(raw: string, name: string): { next: string; changed: boolean } {
  let doc: { require?: Record<string, string>; "require-dev"?: Record<string, string> };
  try {
    doc = JSON.parse(raw);
  } catch {
    return { next: raw, changed: false };
  }
  let changed = false;
  for (const key of ["require", "require-dev"] as const) {
    const block = doc[key];
    if (block && name in block) {
      delete block[name];
      changed = true;
    }
  }
  if (!changed) {
    return { next: raw, changed: false };
  }
  try {
    const next = JSON.stringify(doc, null, 4) + (raw.endsWith("\n") ? "\n" : "");
    JSON.parse(next);
    return { next, changed: true };
  } catch {
    return { next: raw, changed: false };
  }
}

export function pinGithubUses(raw: string, actionName: string, version: string): { next: string; changed: boolean } {
  const nl = raw.includes("\r\n") ? "\r\n" : "\n";
  let changed = false;
  const lines = raw.split(/\r?\n/).map((line) => {
    const m = line.match(/^(\s*(?:-\s*)?uses:\s*['"]?)([^'"\s]+)(['"]?\s*)$/);
    if (!m) {
      return line;
    }
    const spec = m[2];
    const at = spec.lastIndexOf("@");
    const pkg = at > 0 ? spec.slice(0, at) : spec;
    if (pkg !== actionName) {
      return line;
    }
    changed = true;
    return `${m[1]}${pkg}@${version}${m[3]}`;
  });
  if (!changed) {
    return { next: raw, changed: false };
  }
  const next = lines.join(nl);
  const before = parseGithubWorkflowUses(raw);
  const after = parseGithubWorkflowUses(next);
  if (!keepIfUnchanged(before, after, actionName, "github_actions", false, version)) {
    return { next: raw, changed: false };
  }
  return { next, changed: true };
}

export function pinPubspecDep(raw: string, name: string, version: string): { next: string; changed: boolean } {
  const nl = raw.includes("\r\n") ? "\r\n" : "\n";
  let inDeps = false;
  let changed = false;
  const lines = raw.split(/\r?\n/).map((line) => {
    if (/^dependencies:\s*$/.test(line) || /^dev_dependencies:\s*$/.test(line)) {
      inDeps = true;
      return line;
    }
    if (inDeps && /^\S/.test(line) && !line.startsWith(" ")) {
      inDeps = false;
    }
    if (!inDeps) {
      return line;
    }
    const m = line.match(/^(\s+)([A-Za-z0-9_]+):\s*["']?([^"'\s]+)["']?\s*$/);
    if (m && m[2] === name) {
      changed = true;
      const quote = line.includes('"') ? '"' : line.includes("'") ? "'" : "";
      return `${m[1]}${m[2]}: ${quote}${version}${quote}`;
    }
    return line;
  });
  if (!changed) {
    return { next: raw, changed: false };
  }
  return { next: lines.join(nl), changed: true };
}

export function removePubspecDep(raw: string, name: string): { next: string; changed: boolean } {
  const nl = raw.includes("\r\n") ? "\r\n" : "\n";
  let inDeps = false;
  const lines = raw.split(/\r?\n/).filter((line) => {
    if (/^dependencies:\s*$/.test(line) || /^dev_dependencies:\s*$/.test(line)) {
      inDeps = true;
      return true;
    }
    if (inDeps && /^\S/.test(line) && !line.startsWith(" ")) {
      inDeps = false;
    }
    if (!inDeps) {
      return true;
    }
    return !new RegExp(`^\\s+${name}:`).test(line);
  });
  const next = lines.join(nl);
  return next === raw ? { next: raw, changed: false } : { next, changed: true };
}

export function pinCabalFreeze(raw: string, name: string, version: string): { next: string; changed: boolean } {
  const re = new RegExp(`(${escapeRegExp(name)}\\s*==\\s*)([0-9][0-9A-Za-z.-]*)`, "g");
  const next = raw.replace(re, `$1${version}`);
  if (next === raw) {
    return { next: raw, changed: false };
  }
  const before = parseCabalFreeze(raw);
  const after = parseCabalFreeze(next);
  if (!keepIfUnchanged(before, after, name, "hackage", false, version)) {
    return { next: raw, changed: false };
  }
  return { next, changed: true };
}

export function removeCabalFreeze(raw: string, name: string): { next: string; changed: boolean } {
  const next = raw
    .replace(new RegExp(`,\\s*${escapeRegExp(name)}\\s*==\\s*[0-9][0-9A-Za-z.-]*`, "g"), "")
    .replace(new RegExp(`${escapeRegExp(name)}\\s*==\\s*[0-9][0-9A-Za-z.-]*\\s*,\\s*`, "g"), "");
  if (next === raw) {
    return { next: raw, changed: false };
  }
  const before = parseCabalFreeze(raw);
  const after = parseCabalFreeze(next);
  if (!keepIfUnchanged(before, after, name, "hackage", true)) {
    return { next: raw, changed: false };
  }
  return { next, changed: true };
}

export function pinRenvLock(raw: string, name: string, version: string): { next: string; changed: boolean } {
  let doc: { Packages?: Record<string, { Package?: string; Version?: string }> };
  try {
    doc = JSON.parse(raw);
  } catch {
    return { next: raw, changed: false };
  }
  let changed = false;
  for (const meta of Object.values(doc.Packages || {})) {
    if (meta?.Package === name || meta?.Package?.toLowerCase().replace(/_/g, "-") === name.toLowerCase().replace(/_/g, "-")) {
      meta.Version = version;
      changed = true;
    }
  }
  if (!changed) {
    return { next: raw, changed: false };
  }
  const next = JSON.stringify(doc, null, 2) + (raw.endsWith("\n") ? "\n" : "");
  const before = parseRenvLock(raw);
  const after = parseRenvLock(next);
  if (!keepIfUnchanged(before, after, name, "cran", false, version)) {
    return { next: raw, changed: false };
  }
  return { next, changed: true };
}

export function removeRenvLock(raw: string, name: string): { next: string; changed: boolean } {
  let doc: { Packages?: Record<string, { Package?: string }> };
  try {
    doc = JSON.parse(raw);
  } catch {
    return { next: raw, changed: false };
  }
  let changed = false;
  for (const [key, meta] of Object.entries(doc.Packages || {})) {
    if (meta?.Package === name || key === name) {
      delete doc.Packages![key];
      changed = true;
    }
  }
  if (!changed) {
    return { next: raw, changed: false };
  }
  try {
    const next = JSON.stringify(doc, null, 2) + (raw.endsWith("\n") ? "\n" : "");
    JSON.parse(next);
    return { next, changed: true };
  } catch {
    return { next: raw, changed: false };
  }
}

export function pinConanLock(raw: string, name: string, version: string): { next: string; changed: boolean } {
  let doc: { requires?: unknown[] };
  try {
    doc = JSON.parse(raw);
  } catch {
    return { next: raw, changed: false };
  }
  if (!Array.isArray(doc.requires)) {
    return { next: raw, changed: false };
  }
  let changed = false;
  doc.requires = doc.requires.map((r) => {
    const s = String(r);
    const m = s.match(/^([^/@]+)\/([^/@]+)(.*)$/);
    if (m && m[1] === name) {
      changed = true;
      return `${name}/${version}${m[3] || ""}`;
    }
    return r;
  });
  if (!changed) {
    return { next: raw, changed: false };
  }
  const next = JSON.stringify(doc, null, 2) + (raw.endsWith("\n") ? "\n" : "");
  const before = parseConanLock(raw);
  const after = parseConanLock(next);
  if (!keepIfUnchanged(before, after, name, "conan", false, version)) {
    return { next: raw, changed: false };
  }
  return { next, changed: true };
}

export function removeConanLock(raw: string, name: string): { next: string; changed: boolean } {
  let doc: { requires?: unknown[] };
  try {
    doc = JSON.parse(raw);
  } catch {
    return { next: raw, changed: false };
  }
  if (!Array.isArray(doc.requires)) {
    return { next: raw, changed: false };
  }
  const nextReq = doc.requires.filter((r) => !String(r).startsWith(`${name}/`));
  if (nextReq.length === doc.requires.length) {
    return { next: raw, changed: false };
  }
  doc.requires = nextReq;
  try {
    const next = JSON.stringify(doc, null, 2) + (raw.endsWith("\n") ? "\n" : "");
    JSON.parse(next);
    return { next, changed: true };
  } catch {
    return { next: raw, changed: false };
  }
}

export function pinPyprojectDep(raw: string, name: string, version: string): { next: string; changed: boolean } {
  const want = name.toLowerCase().replace(/_/g, "-");
  const next = raw.replace(/["']([^"']+)["']/g, (full, spec: string) => {
    const exact = spec.match(/^([A-Za-z0-9_.-]+)\s*==\s*([^\s;#]+)/);
    const pkg = (exact ? exact[1] : spec.split(/[=<>!~\s[]/)[0] || "").toLowerCase().replace(/_/g, "-");
    if (pkg !== want) {
      return full;
    }
    const q = full[0];
    return `${q}${name}==${version}${q}`;
  });
  if (next === raw) {
    return { next: raw, changed: false };
  }
  const before = parsePyprojectToml(raw);
  const after = parsePyprojectToml(next);
  if (!keepIfUnchanged(before, after, name, "pypi", false, version)) {
    return { next: raw, changed: false };
  }
  return { next, changed: true };
}

function applyPin(action: ManifestFixAction, raw: string, file: string): { next: string; changed: boolean } {
  const name = action.finding.packageName || "";
  const version = action.version || "";
  const eco = action.finding.ecosystem;
  if (file === "package.json") {
    return pinPackageJsonDependency(raw, name, version);
  }
  if (file === "requirements.txt" || eco === "pypi" && file !== "pyproject.toml") {
    return pinRequirementVersion(raw, name, version);
  }
  if (file === "pyproject.toml") {
    return pinPyprojectDep(raw, name, version);
  }
  if (file === "pom.xml") {
    return pinPomDependency(raw, name, version);
  }
  if (file === "go.mod") {
    return pinGoModRequire(raw, name, version);
  }
  if (file === "cargo.toml") {
    return pinCargoTomlDep(raw, name, version);
  }
  if (file === "gemfile") {
    return pinGemfileGem(raw, name, version);
  }
  if (file === "packages.lock.json") {
    return pinNugetLock(raw, name, version);
  }
  if (file === "packages.config") {
    return pinPackagesConfig(raw, name, version);
  }
  if (file === "composer.json") {
    return pinComposerJson(raw, name, version);
  }
  if (file.endsWith(".yml") || file.endsWith(".yaml")) {
    return pinGithubUses(raw, name, version);
  }
  if (file === "pubspec.yaml") {
    return pinPubspecDep(raw, name, version);
  }
  if (file === "cabal.project.freeze") {
    return pinCabalFreeze(raw, name, version);
  }
  if (file === "renv.lock") {
    return pinRenvLock(raw, name, version);
  }
  if (file === "conan.lock") {
    return pinConanLock(raw, name, version);
  }
  return { next: raw, changed: false };
}

function applyDelete(action: ManifestFixAction, raw: string, file: string): { next: string; changed: boolean } {
  const name = action.finding.packageName || "";
  const eco = action.finding.ecosystem;
  if (file === "package.json") {
    const next = removePackageJsonDependency(raw, name);
    try {
      JSON.parse(next);
      return { next, changed: next !== raw };
    } catch {
      return { next: raw, changed: false };
    }
  }
  if (file === "requirements.txt" || (eco === "pypi" && file !== "pyproject.toml")) {
    const next = stripRequirementsLine(raw, name);
    return { next, changed: next !== raw };
  }
  if (file === "pom.xml") {
    return removePomDependency(raw, name);
  }
  if (file === "go.mod") {
    return removeGoModRequire(raw, name);
  }
  if (file === "cargo.toml") {
    return removeCargoTomlDep(raw, name);
  }
  if (file === "gemfile") {
    return removeGemfileGem(raw, name);
  }
  if (file === "packages.lock.json") {
    return removeNugetLock(raw, name);
  }
  if (file === "packages.config") {
    return removePackagesConfig(raw, name);
  }
  if (file === "composer.json") {
    return removeComposerJson(raw, name);
  }
  if (file === "pubspec.yaml") {
    return removePubspecDep(raw, name);
  }
  if (file === "cabal.project.freeze") {
    return removeCabalFreeze(raw, name);
  }
  if (file === "renv.lock") {
    return removeRenvLock(raw, name);
  }
  if (file === "conan.lock") {
    return removeConanLock(raw, name);
  }
  return { next: raw, changed: false };
}

export function applyManifestEdit(action: ManifestFixAction, raw: string, editPath: string): { next: string; ok: boolean } {
  const file = baseName(editPath);
  if (action.kind === "delete") {
    const { next, changed } = applyDelete(action, raw, file);
    return { next: changed ? next : raw, ok: changed };
  }
  if (action.kind === "pin") {
    const { next, changed } = applyPin(action, raw, file);
    return { next: changed ? next : raw, ok: changed };
  }
  return { next: raw, ok: false };
}
