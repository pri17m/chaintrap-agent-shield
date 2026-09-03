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
      });
    }
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
  return analyzePackages(packagesFromItems(toAnalyze), source, fetchImpl);
}
