import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { CoverageKind, Ecosystem, InventoryItem } from "../types";
import { isExactVersionString, normalizePackageName } from "./ecosystems";
import {
  parseBunLockBody,
  parseCabalFreeze,
  parseCargoLock,
  parseCargoToml,
  parseComposerLock,
  parseConanLock,
  parseDepsJson,
  parseGemfileLock,
  parseGithubWorkflowUses,
  parseGoMod,
  parseGoSum,
  parseGradleLockfile,
  parseGradleVerificationMetadata,
  parseMixLock,
  parseNugetPackagesLock,
  parsePackageResolved,
  parsePackagesConfig,
  parsePdmOrPylock,
  parsePomXml,
  parsePubspecLock,
  parsePyprojectToml,
  parseRenvLock,
  parseStackYamlLock,
} from "./ecoParsers";
import {
  parsePackageLockJson,
  parsePipfileLockJson,
  parsePnpmLockBody,
  parsePnpmPackageKey,
  parseTomlPackageTables,
  parseYarnLockBody,
} from "./lockfileParsers";
import { formatMcpInvocation, inferredFromMcpServer, parseMcpConfigJson } from "./mcpParser";
import { isExactNpmSpec, isExactPypiRequirement, pypiRequirementName } from "./pinSpec";

export { parsePnpmPackageKey, parseYarnLockBody };

const SKIP_WALK_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".venv",
  "venv",
  "__pycache__",
  ".next",
  "coverage",
  "vendor",
  "target",
  "bin",
  "obj",
]);

const PACKAGE_INVENTORY_FILES = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "uv.lock",
  "poetry.lock",
  "Pipfile.lock",
  "pdm.lock",
  "pylock.toml",
  "pyproject.toml",
  "requirements.txt",
  "pom.xml",
  "go.mod",
  "go.sum",
  "Cargo.lock",
  "Cargo.toml",
  "Gemfile.lock",
  "gems.locked",
  "Gemfile",
  "packages.lock.json",
  "packages.config",
  "composer.lock",
  "composer.json",
  "pubspec.lock",
  "pubspec.yaml",
  "mix.lock",
  "mix.exs",
  "Package.resolved",
  "Package.swift",
  "cabal.project.freeze",
  "stack.yaml.lock",
  "renv.lock",
  "conan.lock",
  "conanfile.txt",
  "conanfile.py",
  "gradle.lockfile",
  "buildscript-gradle.lockfile",
  "verification-metadata.xml",
  "build.gradle",
  "build.gradle.kts",
]);

function isPackageInventoryFile(name: string): boolean {
  return PACKAGE_INVENTORY_FILES.has(name) || name.endsWith(".deps.json");
}

/** Skip loading skill/rule bodies larger than this (bytes). */
export const MAX_SKILL_FILE_BYTES = 256 * 1024;
/** Soft cap on files collected per tree walk root. */
export const MAX_FILES_PER_TREE = 400;

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function readText(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/** Drop ephemeral fields before persisting baselines. */
export function persistableItem(item: InventoryItem): InventoryItem {
  const { content: _content, ...rest } = item;
  return rest;
}

function walkFiles(
  dir: string,
  matcher: (name: string) => boolean,
  acc: string[],
  depth = 0,
  maxFiles = MAX_FILES_PER_TREE,
): void {
  if (depth > 6 || acc.length >= maxFiles) {
    return;
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (acc.length >= maxFiles) {
      return;
    }
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_WALK_DIRS.has(e.name)) {
        continue;
      }
      walkFiles(full, matcher, acc, depth + 1, maxFiles);
    } else if (e.isFile() && matcher(e.name)) {
      acc.push(full);
    }
  }
}

function addPackage(
  items: InventoryItem[],
  workspaceRoot: string,
  filePath: string,
  ecosystem: Ecosystem,
  name: string,
  version: string,
  extra?: { pinExact?: boolean; spec?: string },
): void {
  const n = normalizePackageName(ecosystem, name);
  const v = version.trim() || "unknown";
  if (!n) {
    return;
  }
  const key = `pkg:${ecosystem}:${n}@${v}:${filePath}`;
  items.push({
    key,
    kind: "package",
    path: filePath,
    hash: sha256(key),
    workspaceRoot,
    packageName: n,
    version: v,
    ecosystem,
    pinExact: extra?.pinExact,
    spec: extra?.spec,
  });
}

function parsePackageJson(filePath: string, workspaceRoot: string, items: InventoryItem[]): void {
  const raw = readText(filePath);
  if (!raw) {
    return;
  }
  try {
    const doc = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    for (const block of [doc.dependencies, doc.devDependencies, doc.optionalDependencies]) {
      if (!block) {
        continue;
      }
      for (const [name, spec] of Object.entries(block)) {
        const raw = String(spec ?? "").trim();
        if (isExactNpmSpec(raw)) {
          addPackage(items, workspaceRoot, filePath, "npm", name, raw, { pinExact: true });
        } else {
          addPackage(items, workspaceRoot, filePath, "npm", name, "unknown", { pinExact: false, spec: raw || "unknown" });
        }
      }
    }
  } catch {
    /* ignore */
  }
}

function addCoverageNote(
  items: InventoryItem[],
  workspaceRoot: string,
  filePath: string,
  ecosystem: Ecosystem,
  coverageKind: CoverageKind = "no-lockfile",
): void {
  const key = `coverage:${ecosystem}-${coverageKind}:${filePath}`;
  items.push({
    key,
    kind: "coverage",
    path: filePath,
    hash: sha256(key),
    workspaceRoot,
    ecosystem,
    coverageKind,
  });
}

function addLockedPackages(
  items: InventoryItem[],
  workspaceRoot: string,
  filePath: string,
  ecosystem: Ecosystem,
  pkgs: Array<{ name: string; version: string }>,
): void {
  for (const p of pkgs) {
    const exact = isExactVersionString(p.version);
    addPackage(items, workspaceRoot, filePath, ecosystem, p.name, exact ? p.version : "unknown", {
      pinExact: exact,
      spec: exact ? undefined : p.version || "unknown",
    });
  }
}

function parseTextLock(
  filePath: string,
  workspaceRoot: string,
  items: InventoryItem[],
  ecosystem: Ecosystem,
  parser: (raw: string) => Array<{ name: string; version: string }>,
): boolean {
  const raw = readText(filePath);
  if (!raw) {
    return false;
  }
  try {
    addLockedPackages(items, workspaceRoot, filePath, ecosystem, parser(raw));
    return true;
  } catch {
    return false;
  }
}

function joinIfExists(dir: string, name: string): string | null {
  const full = path.join(dir, name);
  return fs.existsSync(full) ? full : null;
}

function parsePackageLock(filePath: string, workspaceRoot: string, items: InventoryItem[]): void {
  const raw = readText(filePath);
  if (!raw) {
    return;
  }
  try {
    addLockedPackages(items, workspaceRoot, filePath, "npm", parsePackageLockJson(raw));
  } catch {
    /* ignore */
  }
}

function parsePnpmLock(filePath: string, workspaceRoot: string, items: InventoryItem[]): void {
  const raw = readText(filePath);
  if (!raw) {
    return;
  }
  addLockedPackages(items, workspaceRoot, filePath, "npm", parsePnpmLockBody(raw));
}

function parseYarnLock(filePath: string, workspaceRoot: string, items: InventoryItem[]): void {
  const raw = readText(filePath);
  if (!raw) {
    return;
  }
  addLockedPackages(items, workspaceRoot, filePath, "npm", parseYarnLockBody(raw));
}

function parseTomlLock(filePath: string, workspaceRoot: string, items: InventoryItem[]): void {
  const raw = readText(filePath);
  if (!raw) {
    return;
  }
  addLockedPackages(items, workspaceRoot, filePath, "pypi", parseTomlPackageTables(raw));
}

function parsePipfileLock(filePath: string, workspaceRoot: string, items: InventoryItem[]): void {
  const raw = readText(filePath);
  if (!raw) {
    return;
  }
  try {
    addLockedPackages(items, workspaceRoot, filePath, "pypi", parsePipfileLockJson(raw));
  } catch {
    /* ignore */
  }
}

function parseRequirements(filePath: string, workspaceRoot: string, items: InventoryItem[]): void {
  const raw = readText(filePath);
  if (!raw) {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("-")) {
      continue;
    }
    const exact = isExactPypiRequirement(t);
    if (exact) {
      addPackage(items, workspaceRoot, filePath, "pypi", exact.name, exact.version, { pinExact: true });
      continue;
    }
    const name = pypiRequirementName(t);
    if (name) {
      addPackage(items, workspaceRoot, filePath, "pypi", name, "unknown", { pinExact: false, spec: t });
    }
  }
}

function parseMcpFile(filePath: string, workspaceRoot: string | undefined, items: InventoryItem[]): void {
  const raw = readText(filePath);
  if (!raw) {
    return;
  }
  for (const server of parseMcpConfigJson(raw)) {
    const inferred = inferredFromMcpServer(server);
    let version = inferred?.version;
    let pinExact: boolean | undefined;
    let spec: string | undefined;
    if (inferred && version && !isExactVersionString(version)) {
      spec = version;
      version = "unknown";
      pinExact = false;
    } else if (inferred && version && isExactVersionString(version)) {
      pinExact = true;
    }
    const key = `mcp:${filePath}:${server.id}`;
    const command = formatMcpInvocation(server);
    items.push({
      key,
      kind: "mcp",
      path: filePath,
      hash: sha256(`${key}:${JSON.stringify(server)}`),
      workspaceRoot,
      mcpId: server.id,
      packageName: inferred?.name,
      version,
      ecosystem: inferred?.ecosystem,
      pinExact,
      spec,
      mcpCommand: command || undefined,
      mcpUrl: server.url || undefined,
    });
  }
}

function parseTextFiles(
  files: string[],
  kind: "skill" | "rule",
  workspaceRoot: string | undefined,
  items: InventoryItem[],
): void {
  for (const filePath of files) {
    let size = 0;
    let mtimeMs = 0;
    try {
      const st = fs.statSync(filePath);
      size = st.size;
      mtimeMs = st.mtimeMs;
    } catch {
      continue;
    }
    if (size > MAX_SKILL_FILE_BYTES) {
      items.push({
        key: `${kind}:${filePath}`,
        kind,
        path: filePath,
        hash: sha256(`oversized:${size}:${mtimeMs}:${filePath}`),
        workspaceRoot,
      });
      continue;
    }
    const raw = readText(filePath);
    if (raw === null) {
      continue;
    }
    items.push({
      key: `${kind}:${filePath}`,
      kind,
      path: filePath,
      hash: sha256(raw),
      workspaceRoot,
      content: raw,
    });
  }
}

function isSkillContentFile(name: string): boolean {
  const u = name.toUpperCase();
  return u === "SKILL.MD" || u.endsWith(".MD") || /\.(JS|MJS|CJS|PY|SH|PS1|BASH)$/i.test(name);
}

export function userConfigPaths(): {
  mcp: string[];
  skillDirs: string[];
  commandDirs: string[];
  ruleDirs: string[];
} {
  const home = os.homedir();
  const mcp: string[] = [
    path.join(home, ".cursor", "mcp.json"),
    path.join(home, "AppData", "Roaming", "Code", "User", "mcp.json"),
    path.join(home, "AppData", "Roaming", "Cursor", "User", "mcp.json"),
  ];
  if (process.env.APPDATA) {
    mcp.push(path.join(process.env.APPDATA, "Code", "User", "mcp.json"));
    mcp.push(path.join(process.env.APPDATA, "Cursor", "User", "mcp.json"));
  }
  if (process.platform === "darwin") {
    mcp.push(path.join(home, "Library", "Application Support", "Code", "User", "mcp.json"));
  }
  if (process.platform === "linux") {
    mcp.push(path.join(home, ".config", "Code", "User", "mcp.json"));
  }
  return {
    mcp: [...new Set(mcp)],
    skillDirs: [path.join(home, ".cursor", "skills"), path.join(home, ".claude", "skills")],
    commandDirs: [path.join(home, ".cursor", "commands"), path.join(home, ".claude", "commands")],
    ruleDirs: [path.join(home, ".cursor", "rules")],
  };
}

function discoverPackageDirs(workspaceRoot: string): string[] {
  const files: string[] = [];
  walkFiles(workspaceRoot, isPackageInventoryFile, files);
  const dirs = new Set<string>();
  for (const f of files) {
    dirs.add(path.dirname(f));
  }
  return [...dirs];
}

function inventoryPackageDir(dir: string, workspaceRoot: string, items: InventoryItem[]): void {
  const pkgJson = path.join(dir, "package.json");
  const npmLocks = [
    joinIfExists(dir, "package-lock.json"),
    joinIfExists(dir, "pnpm-lock.yaml"),
    joinIfExists(dir, "yarn.lock"),
    joinIfExists(dir, "bun.lock"),
  ].filter((p): p is string => Boolean(p));
  if (npmLocks.length) {
    for (const lockPath of npmLocks) {
      const base = path.basename(lockPath);
      if (base === "package-lock.json") {
        parsePackageLock(lockPath, workspaceRoot, items);
      } else if (base === "pnpm-lock.yaml") {
        parsePnpmLock(lockPath, workspaceRoot, items);
      } else if (base === "yarn.lock") {
        parseYarnLock(lockPath, workspaceRoot, items);
      } else if (base === "bun.lock") {
        parseTextLock(lockPath, workspaceRoot, items, "npm", parseBunLockBody);
      }
    }
  } else if (fs.existsSync(pkgJson)) {
    parsePackageJson(pkgJson, workspaceRoot, items);
    addCoverageNote(items, workspaceRoot, pkgJson, "npm");
  }

  const pypiLocks = [
    joinIfExists(dir, "uv.lock"),
    joinIfExists(dir, "poetry.lock"),
    joinIfExists(dir, "Pipfile.lock"),
    joinIfExists(dir, "pdm.lock"),
    joinIfExists(dir, "pylock.toml"),
  ].filter((p): p is string => Boolean(p));
  const req = joinIfExists(dir, "requirements.txt");
  const pyproject = joinIfExists(dir, "pyproject.toml");
  if (pypiLocks.length) {
    for (const lockPath of pypiLocks) {
      const base = path.basename(lockPath);
      if (base === "Pipfile.lock") {
        parsePipfileLock(lockPath, workspaceRoot, items);
      } else if (base === "pdm.lock" || base === "pylock.toml") {
        parseTextLock(lockPath, workspaceRoot, items, "pypi", parsePdmOrPylock);
      } else {
        parseTomlLock(lockPath, workspaceRoot, items);
      }
    }
  } else {
    if (req) {
      parseRequirements(req, workspaceRoot, items);
      addCoverageNote(items, workspaceRoot, req, "pypi");
    }
    if (pyproject) {
      parseTextLock(pyproject, workspaceRoot, items, "pypi", parsePyprojectToml);
      addCoverageNote(items, workspaceRoot, pyproject, "pypi");
    }
  }

  const gradleLocks = [
    joinIfExists(dir, "gradle.lockfile"),
    joinIfExists(dir, "buildscript-gradle.lockfile"),
    joinIfExists(dir, "verification-metadata.xml"),
  ].filter((p): p is string => Boolean(p));
  const pom = joinIfExists(dir, "pom.xml");
  const gradleDsl = joinIfExists(dir, "build.gradle") || joinIfExists(dir, "build.gradle.kts");
  if (gradleLocks.length) {
    for (const lockPath of gradleLocks) {
      const parser = path.basename(lockPath) === "verification-metadata.xml" ? parseGradleVerificationMetadata : parseGradleLockfile;
      parseTextLock(lockPath, workspaceRoot, items, "maven", parser);
    }
  } else if (pom) {
    parseTextLock(pom, workspaceRoot, items, "maven", parsePomXml);
    addCoverageNote(items, workspaceRoot, pom, "maven");
  } else if (gradleDsl) {
    addCoverageNote(items, workspaceRoot, gradleDsl, "maven", "unscanned");
  }

  const goSum = joinIfExists(dir, "go.sum");
  const goMod = joinIfExists(dir, "go.mod");
  if (goSum) {
    parseTextLock(goSum, workspaceRoot, items, "go", parseGoSum);
  } else if (goMod) {
    parseTextLock(goMod, workspaceRoot, items, "go", parseGoMod);
    addCoverageNote(items, workspaceRoot, goMod, "go");
  }

  const cargoLock = joinIfExists(dir, "Cargo.lock");
  const cargoToml = joinIfExists(dir, "Cargo.toml");
  if (cargoLock) {
    parseTextLock(cargoLock, workspaceRoot, items, "crates", parseCargoLock);
  } else if (cargoToml) {
    parseTextLock(cargoToml, workspaceRoot, items, "crates", parseCargoToml);
    addCoverageNote(items, workspaceRoot, cargoToml, "crates");
  }

  const gemLock = joinIfExists(dir, "Gemfile.lock") || joinIfExists(dir, "gems.locked");
  const gemfile = joinIfExists(dir, "Gemfile");
  if (gemLock) {
    parseTextLock(gemLock, workspaceRoot, items, "rubygems", parseGemfileLock);
  } else if (gemfile) {
    addCoverageNote(items, workspaceRoot, gemfile, "rubygems", "unscanned");
  }

  const nugetLock = joinIfExists(dir, "packages.lock.json");
  const packagesConfig = joinIfExists(dir, "packages.config");
  if (nugetLock) {
    parseTextLock(nugetLock, workspaceRoot, items, "nuget", parseNugetPackagesLock);
  } else if (packagesConfig) {
    parseTextLock(packagesConfig, workspaceRoot, items, "nuget", parsePackagesConfig);
    addCoverageNote(items, workspaceRoot, packagesConfig, "nuget");
  }
  try {
    const entries = fs.readdirSync(dir);
    for (const name of entries) {
      if (name.endsWith(".deps.json")) {
        parseTextLock(path.join(dir, name), workspaceRoot, items, "nuget", parseDepsJson);
      }
    }
  } catch {
    /* ignore */
  }

  const composerLock = joinIfExists(dir, "composer.lock");
  const composerJson = joinIfExists(dir, "composer.json");
  if (composerLock) {
    parseTextLock(composerLock, workspaceRoot, items, "packagist", parseComposerLock);
  } else if (composerJson) {
    addCoverageNote(items, workspaceRoot, composerJson, "packagist", "unscanned");
  }

  const pubLock = joinIfExists(dir, "pubspec.lock");
  const pubspec = joinIfExists(dir, "pubspec.yaml");
  if (pubLock) {
    parseTextLock(pubLock, workspaceRoot, items, "pub", parsePubspecLock);
  } else if (pubspec) {
    addCoverageNote(items, workspaceRoot, pubspec, "pub", "unscanned");
  }

  const mixLock = joinIfExists(dir, "mix.lock");
  const mixExs = joinIfExists(dir, "mix.exs");
  if (mixLock) {
    parseTextLock(mixLock, workspaceRoot, items, "hex", parseMixLock);
  } else if (mixExs) {
    addCoverageNote(items, workspaceRoot, mixExs, "hex", "unscanned");
  }

  const packageResolved = joinIfExists(dir, "Package.resolved");
  const packageSwift = joinIfExists(dir, "Package.swift");
  if (packageResolved) {
    parseTextLock(packageResolved, workspaceRoot, items, "swift", parsePackageResolved);
  } else if (packageSwift) {
    addCoverageNote(items, workspaceRoot, packageSwift, "swift", "unscanned");
  }

  const cabalFreeze = joinIfExists(dir, "cabal.project.freeze");
  const stackLock = joinIfExists(dir, "stack.yaml.lock");
  if (cabalFreeze) {
    parseTextLock(cabalFreeze, workspaceRoot, items, "hackage", parseCabalFreeze);
  } else if (stackLock) {
    parseTextLock(stackLock, workspaceRoot, items, "hackage", parseStackYamlLock);
  }

  const renv = joinIfExists(dir, "renv.lock");
  if (renv) {
    parseTextLock(renv, workspaceRoot, items, "cran", parseRenvLock);
  }

  const conanLock = joinIfExists(dir, "conan.lock");
  const conanfile = joinIfExists(dir, "conanfile.txt") || joinIfExists(dir, "conanfile.py");
  if (conanLock) {
    parseTextLock(conanLock, workspaceRoot, items, "conan", parseConanLock);
  } else if (conanfile) {
    addCoverageNote(items, workspaceRoot, conanfile, "conan", "unscanned");
  }
}

export function inventoryWorkspaceRoot(workspaceRoot: string): InventoryItem[] {
  const items: InventoryItem[] = [];
  for (const dir of discoverPackageDirs(workspaceRoot)) {
    inventoryPackageDir(dir, workspaceRoot, items);
  }
  const mcpWs = path.join(workspaceRoot, ".cursor", "mcp.json");
  if (fs.existsSync(mcpWs)) {
    parseMcpFile(mcpWs, workspaceRoot, items);
  }
  const mcpVscode = path.join(workspaceRoot, ".vscode", "mcp.json");
  if (fs.existsSync(mcpVscode)) {
    parseMcpFile(mcpVscode, workspaceRoot, items);
  }
  const skillFiles: string[] = [];
  walkFiles(path.join(workspaceRoot, ".cursor", "skills"), isSkillContentFile, skillFiles);
  walkFiles(path.join(workspaceRoot, ".claude", "skills"), isSkillContentFile, skillFiles);
  walkFiles(path.join(workspaceRoot, ".cursor", "commands"), (n) => n.toUpperCase().endsWith(".MD"), skillFiles);
  walkFiles(path.join(workspaceRoot, ".claude", "commands"), (n) => n.toUpperCase().endsWith(".MD"), skillFiles);
  parseTextFiles(skillFiles, "skill", workspaceRoot, items);

  const ruleFiles: string[] = [];
  walkFiles(path.join(workspaceRoot, ".cursor", "rules"), (n) => n.endsWith(".mdc") || n.endsWith(".md"), ruleFiles);
  for (const extra of ["AGENTS.md", "CLAUDE.md", "MEMORY.md", "SOUL.md", ".cursorrules"]) {
    const p = path.join(workspaceRoot, extra);
    if (fs.existsSync(p)) {
      ruleFiles.push(p);
    }
  }
  for (const settings of [
    path.join(workspaceRoot, ".claude", "settings.json"),
    path.join(workspaceRoot, ".claude", "settings.local.json"),
  ]) {
    if (fs.existsSync(settings)) {
      ruleFiles.push(settings);
    }
  }
  parseTextFiles(ruleFiles, "rule", workspaceRoot, items);
  const workflowFiles: string[] = [];
  walkFiles(
    path.join(workspaceRoot, ".github", "workflows"),
    (n) => n.endsWith(".yml") || n.endsWith(".yaml"),
    workflowFiles,
  );
  for (const wf of workflowFiles) {
    parseTextLock(wf, workspaceRoot, items, "github_actions", parseGithubWorkflowUses);
  }
  return items;
}

export function inventoryUserConfig(): InventoryItem[] {
  const items: InventoryItem[] = [];
  const cfg = userConfigPaths();
  for (const p of cfg.mcp) {
    if (fs.existsSync(p)) {
      parseMcpFile(p, undefined, items);
    }
  }
  const skillFiles: string[] = [];
  for (const d of cfg.skillDirs) {
    walkFiles(d, isSkillContentFile, skillFiles);
  }
  for (const d of cfg.commandDirs) {
    walkFiles(d, (n) => n.toUpperCase().endsWith(".MD"), skillFiles);
  }
  parseTextFiles(skillFiles, "skill", undefined, items);
  const ruleFiles: string[] = [];
  for (const d of cfg.ruleDirs) {
    walkFiles(d, (n) => n.endsWith(".mdc") || n.endsWith(".md"), ruleFiles);
  }
  parseTextFiles(ruleFiles, "rule", undefined, items);
  return items;
}
