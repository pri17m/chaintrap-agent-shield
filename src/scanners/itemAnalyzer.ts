import * as fs from "fs";
import type { Finding, FindingSource, InventoryItem } from "../types";
import { analyzeSkillOrRule } from "./skillHeuristics";
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

export async function analyzeItems(
  items: InventoryItem[],
  source: FindingSource,
  fetchImpl?: typeof fetch,
): Promise<Finding[]> {
  const findings = await analyzePackages(packagesFromItems(items), source, fetchImpl);
  const now = new Date().toISOString();
  for (const item of items) {
    if (item.kind !== "skill" && item.kind !== "rule") {
      continue;
    }
    let content = "";
    try {
      content = fs.readFileSync(item.path, "utf8");
    } catch {
      continue;
    }
    const hits = analyzeSkillOrRule(content, item.path);
    for (const hit of hits) {
      findings.push({
        id: `${source}:${item.kind}:${item.path}:${hit.title}`,
        source,
        surface: item.kind,
        severity: hit.severity,
        title: hit.title,
        message: `Description: ${hit.message}`,
        summary: hit.message,
        path: item.path,
        acknowledged: false,
        workspaceRoot: item.workspaceRoot,
        createdAt: now,
      });
    }
  }
  return findings;
}
