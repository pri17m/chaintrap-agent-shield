import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { InventoryItem } from "../types";
import { inferredFromMcpServer, parseMcpConfigJson } from "./mcpParser";

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

function walkFiles(dir: string, matcher: (name: string) => boolean, acc: string[], depth = 0): void {
  if (depth > 6) {
    return;
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git") {
        continue;
      }
      walkFiles(full, matcher, acc, depth + 1);
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
    const raw = readText(filePath) || "";
    items.push({
      key: `${kind}:${filePath}`,
      kind,
      path: filePath,
      hash: sha256(raw),
      workspaceRoot,
    });
  }
}

export function userConfigPaths(): { mcp: string[]; skillDirs: string[]; ruleDirs: string[] } {
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
  const req = path.join(workspaceRoot, "requirements.txt");
  if (fs.existsSync(req)) {
    parseRequirements(req, workspaceRoot, items);
  }
  const mcpWs = path.join(workspaceRoot, ".cursor", "mcp.json");
  if (fs.existsSync(mcpWs)) {
    parseMcpFile(mcpWs, workspaceRoot, items);
  }
  const skillFiles: string[] = [];
  walkFiles(path.join(workspaceRoot, ".cursor", "skills"), (n) => n.toUpperCase() === "SKILL.MD", skillFiles);
  walkFiles(path.join(workspaceRoot, ".claude", "skills"), (n) => n.toUpperCase() === "SKILL.MD", skillFiles);
  parseTextFiles(skillFiles, "skill", workspaceRoot, items);

  const ruleFiles: string[] = [];
  walkFiles(path.join(workspaceRoot, ".cursor", "rules"), (n) => n.endsWith(".mdc") || n.endsWith(".md"), ruleFiles);
  const agents = path.join(workspaceRoot, "AGENTS.md");
  if (fs.existsSync(agents)) {
    ruleFiles.push(agents);
  }
  const cursorrules = path.join(workspaceRoot, ".cursorrules");
  if (fs.existsSync(cursorrules)) {
    ruleFiles.push(cursorrules);
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
    walkFiles(d, (n) => n.toUpperCase() === "SKILL.MD", skillFiles);
  }
  parseTextFiles(skillFiles, "skill", undefined, items);
  const ruleFiles: string[] = [];
  for (const d of cfg.ruleDirs) {
    walkFiles(d, (n) => n.endsWith(".mdc") || n.endsWith(".md"), ruleFiles);
  }
  parseTextFiles(ruleFiles, "rule", undefined, items);
  return items;
}
