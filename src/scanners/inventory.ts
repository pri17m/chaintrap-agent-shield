import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Ecosystem, InventoryItem } from "../types";
import {
  parsePackageLockJson,
  parsePipfileLockJson,
  parsePnpmLockBody,
  parsePnpmPackageKey,
  parseTomlPackageTables,
  parseYarnLockBody,
} from "./lockfileParsers";
import { inferredFromMcpServer, parseMcpConfigJson } from "./mcpParser";
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
]);

const PACKAGE_INVENTORY_FILES = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "uv.lock",
  "poetry.lock",
  "Pipfile.lock",
  "requirements.txt",
]);

function isPackageInventoryFile(name: string): boolean {
  return PACKAGE_INVENTORY_FILES.has(name);
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
  ecosystem: "npm" | "pypi",
  name: string,
  version: string,
  extra?: { pinExact?: boolean; spec?: string },
): void {
  const n = name.trim().toLowerCase();
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
): void {
  const key = `coverage:${ecosystem}-lock:${filePath}`;
  items.push({
    key,
    kind: "coverage",
    path: filePath,
    hash: sha256(key),
    workspaceRoot,
    ecosystem,
    coverageKind: "no-lockfile",
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
    addPackage(items, workspaceRoot, filePath, ecosystem, p.name, p.version);
  }
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
    if (inferred && version && !isExactNpmSpec(version)) {
      spec = version;
      version = "unknown";
      pinExact = false;
    } else if (inferred && version && isExactNpmSpec(version)) {
      pinExact = true;
    }
    const key = `mcp:${filePath}:${server.id}`;
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
  const lock = path.join(dir, "package-lock.json");
  const pnpm = path.join(dir, "pnpm-lock.yaml");
  const yarn = path.join(dir, "yarn.lock");
  const hasNpmLock = fs.existsSync(lock) || fs.existsSync(pnpm) || fs.existsSync(yarn);
  if (hasNpmLock) {
    if (fs.existsSync(lock)) {
      parsePackageLock(lock, workspaceRoot, items);
    }
    if (fs.existsSync(pnpm)) {
      parsePnpmLock(pnpm, workspaceRoot, items);
    }
    if (fs.existsSync(yarn)) {
      parseYarnLock(yarn, workspaceRoot, items);
    }
  } else if (fs.existsSync(pkgJson)) {
    parsePackageJson(pkgJson, workspaceRoot, items);
    addCoverageNote(items, workspaceRoot, pkgJson, "npm");
  }
  const uv = path.join(dir, "uv.lock");
  const poetry = path.join(dir, "poetry.lock");
  const pipfile = path.join(dir, "Pipfile.lock");
  const req = path.join(dir, "requirements.txt");
  const hasPyLock = fs.existsSync(uv) || fs.existsSync(poetry) || fs.existsSync(pipfile);
  if (hasPyLock) {
    if (fs.existsSync(uv)) {
      parseTomlLock(uv, workspaceRoot, items);
    }
    if (fs.existsSync(poetry)) {
      parseTomlLock(poetry, workspaceRoot, items);
    }
    if (fs.existsSync(pipfile)) {
      parsePipfileLock(pipfile, workspaceRoot, items);
    }
  } else if (fs.existsSync(req)) {
    parseRequirements(req, workspaceRoot, items);
    addCoverageNote(items, workspaceRoot, req, "pypi");
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
