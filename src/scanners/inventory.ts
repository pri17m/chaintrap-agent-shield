import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { InventoryItem } from "../types";
import { inferredFromMcpServer, parseMcpConfigJson } from "./mcpParser";

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
      if (e.name === "node_modules" || e.name === ".git") {
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
        const ver = spec.replace(/^[\^~>=<]*/, "").split(" ")[0] || "unknown";
        addPackage(items, workspaceRoot, filePath, "npm", name, ver);
      }
    }
  } catch {
    /* ignore */
  }
}

function parsePackageLock(filePath: string, workspaceRoot: string, items: InventoryItem[]): void {
  const raw = readText(filePath);
  if (!raw) {
    return;
  }
  try {
    const doc = JSON.parse(raw) as { packages?: Record<string, { version?: string }> };
    for (const [pkgPath, meta] of Object.entries(doc.packages || {})) {
      if (!pkgPath || pkgPath === "") {
        continue;
      }
      const name = pkgPath.replace(/^node_modules\//, "");
      addPackage(items, workspaceRoot, filePath, "npm", name, meta.version || "unknown");
    }
  } catch {
    /* ignore */
  }
}

/** Extract name@version from pnpm packages keys like `/lodash@4.17.21` or `@scope/pkg@1.0.0`. */
export function parsePnpmPackageKey(key: string): { name: string; version: string } | null {
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

function parsePnpmLock(filePath: string, workspaceRoot: string, items: InventoryItem[]): void {
  const raw = readText(filePath);
  if (!raw) {
    return;
  }
  // Prefer JSON-like packages: block keys; also accept importers-less classic YAML keys under packages:
  const packagesIdx = raw.search(/^packages:\s*$/m);
  if (packagesIdx < 0) {
    return;
  }
  const section = raw.slice(packagesIdx);
  const keyRe = /^\s{2}('([^']+)'|"([^"]+)"|(\/[^\s:]+|[^\s:][^:]*)):\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(section))) {
    const key = m[2] || m[3] || m[4] || "";
    const parsed = parsePnpmPackageKey(key);
    if (parsed) {
      addPackage(items, workspaceRoot, filePath, "npm", parsed.name, parsed.version);
    }
  }
}

/** Yarn classic lock: `name@version:` then `  version "x.y.z"`. */
export function parseYarnLockBody(raw: string): Array<{ name: string; version: string }> {
  const out: Array<{ name: string; version: string }> = [];
  const lines = raw.split(/\r?\n/);
  let pendingNames: string[] = [];
  for (const line of lines) {
    if (!line.trim() || line.startsWith("#")) {
      continue;
    }
    const header = line.match(/^"?(@?[^@\s"]+)@[^:]+:"?\s*$/);
    if (header && !line.startsWith(" ")) {
      // Multi-key headers: "a@1, b@1:"
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

function parseYarnLock(filePath: string, workspaceRoot: string, items: InventoryItem[]): void {
  const raw = readText(filePath);
  if (!raw) {
    return;
  }
  for (const { name, version } of parseYarnLockBody(raw)) {
    addPackage(items, workspaceRoot, filePath, "npm", name, version);
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
    const m = t.match(/^([A-Za-z0-9_.-]+)\s*==\s*([^\s;#]+)/);
    if (m) {
      addPackage(items, workspaceRoot, filePath, "pypi", m[1].toLowerCase().replace(/_/g, "-"), m[2]);
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
    const key = `mcp:${filePath}:${server.id}`;
    items.push({
      key,
      kind: "mcp",
      path: filePath,
      hash: sha256(`${key}:${JSON.stringify(server)}`),
      workspaceRoot,
      mcpId: server.id,
      packageName: inferred?.name,
      version: inferred?.version,
      ecosystem: inferred?.ecosystem,
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

export function inventoryWorkspaceRoot(workspaceRoot: string): InventoryItem[] {
  const items: InventoryItem[] = [];
  const pkgJson = path.join(workspaceRoot, "package.json");
  if (fs.existsSync(pkgJson)) {
    parsePackageJson(pkgJson, workspaceRoot, items);
  }
  const lock = path.join(workspaceRoot, "package-lock.json");
  if (fs.existsSync(lock)) {
    parsePackageLock(lock, workspaceRoot, items);
  }
  const pnpm = path.join(workspaceRoot, "pnpm-lock.yaml");
  if (fs.existsSync(pnpm)) {
    parsePnpmLock(pnpm, workspaceRoot, items);
  }
  const yarn = path.join(workspaceRoot, "yarn.lock");
  if (fs.existsSync(yarn)) {
    parseYarnLock(yarn, workspaceRoot, items);
  }
  // uv.lock watched for deltas but not parsed yet (deferred — TOML)
  const req = path.join(workspaceRoot, "requirements.txt");
  if (fs.existsSync(req)) {
    parseRequirements(req, workspaceRoot, items);
  }
  const mcpWs = path.join(workspaceRoot, ".cursor", "mcp.json");
  if (fs.existsSync(mcpWs)) {
    parseMcpFile(mcpWs, workspaceRoot, items);
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
