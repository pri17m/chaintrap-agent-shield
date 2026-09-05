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

export interface AnalyzeItemsOptions {
  /** Inventory keys whose hash is unchanged vs prior baseline — skip re-analysis. */
  skipKeys?: Set<string>;
}

/**
 * Skill/rule heuristics are disabled (false positives). Inventory still records
 * those files; only npm/PyPI packages and MCP-inferred packages produce findings.
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
  return [...pkgs, ...coverageFindings(toAnalyze, source)];
}
