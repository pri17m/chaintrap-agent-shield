import type { Finding, FindingSource, InventoryItem } from "../types";
import { analyzePackages, type PackageToAnalyze } from "./packageAnalyzer";

export function packagesFromItems(items: InventoryItem[]): PackageToAnalyze[] {
  const out: PackageToAnalyze[] = [];
  for (const item of items) {
    if (item.kind === "package" && item.packageName && item.ecosystem) {
      out.push({
        ecosystem: item.ecosystem,
        name: item.packageName,
        version: item.version || "unknown",
        path: item.path,
        workspaceRoot: item.workspaceRoot,
        surface: "package",
        pinExact: item.pinExact,
        spec: item.spec,
      });
    }
    if (item.kind === "mcp" && item.packageName && item.ecosystem) {
      out.push({
        ecosystem: item.ecosystem,
        name: item.packageName,
        version: item.version || "unknown",
        path: item.path,
        workspaceRoot: item.workspaceRoot,
        surface: "mcp",
        mcpId: item.mcpId,
        pinExact: item.pinExact,
        spec: item.spec,
      });
    }
  }
  return out;
}

function coverageFindings(items: InventoryItem[], source: FindingSource): Finding[] {
  const now = new Date().toISOString();
  const out: Finding[] = [];
  for (const item of items) {
    if (item.kind !== "coverage" || !item.ecosystem) {
      continue;
    }
    const lockHint = item.ecosystem === "pypi" ? "uv.lock, poetry.lock, or Pipfile.lock" : "package-lock.json, pnpm-lock.yaml, or yarn.lock";
    out.push({
      id: `${source}:coverage:${item.ecosystem}:${item.path}`,
      source,
      surface: "package",
      severity: "info",
      title: "Only direct pins are checked",
      message: `Add a lockfile (${lockHint}) to include transitive dependencies.`,
      path: item.path,
      ecosystem: item.ecosystem,
      acknowledged: false,
      workspaceRoot: item.workspaceRoot,
      createdAt: now,
      coverageNote: true,
      coverageKind: item.coverageKind || "no-lockfile",
    });
  }
  return out;
}

export function looksLikePipeToShell(line: string): boolean {
  const s = line.toLowerCase();
  return /curl[\s\S]{0,200}\|[\s\S]{0,80}\b(sh|bash|zsh)\b/.test(s) || /wget[\s\S]{0,200}\|[\s\S]{0,80}\b(sh|bash|zsh)\b/.test(s);
}

function uncheckedMcpFindings(items: InventoryItem[], source: FindingSource): Finding[] {
  const now = new Date().toISOString();
  const out: Finding[] = [];
  for (const item of items) {
    if (item.kind !== "mcp" || item.packageName) {
      continue;
    }
    const command = item.mcpCommand || "";
    const url = item.mcpUrl || "";
    const detail = url ? `URL: ${url}` : command ? `Command: ${command}` : "No command or URL recorded.";
    const dropper = looksLikePipeToShell(`${command} ${url}`);
    out.push({
      id: `${source}:mcp:unchecked:${item.mcpId || "unknown"}:${item.path}`,
      source,
      surface: "mcp",
      severity: dropper ? "medium" : "info",
      title: dropper
        ? `Unchecked MCP server ${item.mcpId || "unknown"} (pipe-to-shell)`
        : `Unchecked MCP server ${item.mcpId || "unknown"}`,
      message: dropper
        ? `${detail}\nCommand string looks like curl|sh or wget|sh. Not a registry package — hygiene only, not malware-in-npm/PyPI.`
        : `${detail}\nNot an npm/PyPI package — not checked against the registry.`,
      path: item.path,
      mcpId: item.mcpId,
      mcpCommand: item.mcpCommand,
      mcpUrl: item.mcpUrl,
      acknowledged: false,
      workspaceRoot: item.workspaceRoot,
      createdAt: now,
      coverageNote: true,
      coverageKind: "unchecked-mcp",
    });
  }
  return out;
}

export interface AnalyzeItemsOptions {
  /** Inventory keys whose hash is unchanged vs prior baseline — skip re-analysis. */
  skipKeys?: Set<string>;
}

/**
 * Skill/rule heuristics are disabled (false positives). Inventory still records
 * those files; npm/PyPI packages and MCP-inferred packages are analyzed.
 * MCP rows without a package are listed as unchecked.
 */
export async function analyzeItems(
  items: InventoryItem[],
  source: FindingSource,
  fetchImpl?: typeof fetch,
  options?: AnalyzeItemsOptions,
): Promise<Finding[]> {
  const skip = options?.skipKeys;
  const toAnalyze = skip ? items.filter((i) => !skip.has(i.key)) : items;
  const pkgs = await analyzePackages(packagesFromItems(toAnalyze), source, fetchImpl);
  return [...pkgs, ...coverageFindings(toAnalyze, source), ...uncheckedMcpFindings(toAnalyze, source)];
}
