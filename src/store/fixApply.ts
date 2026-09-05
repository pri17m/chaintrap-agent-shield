import * as path from "path";
import { pinMcpServerById } from "./pinMcp";
import { pinPackageJsonDependency, pinRequirementVersion } from "./pinManifest";
import { removeMcpServerById, removeMcpServerByPackage, removePackageJsonDependency, stripRequirementsLine } from "./uninstall";
import type { FixAction } from "./fixPlan";

function base(filePath: string): string {
  return path.basename(filePath).toLowerCase();
}

export function applyFixToText(action: FixAction, raw: string): { next: string; ok: boolean } {
  const file = base(action.finding.path);
  if (action.kind === "skip") {
    return { next: raw, ok: false };
  }
  if (action.kind === "delete") {
    if (action.finding.surface === "mcp") {
      const { next, removed } = action.finding.mcpId
        ? removeMcpServerById(raw, action.finding.mcpId)
        : removeMcpServerByPackage(raw, action.finding.packageName || "");
      return { next, ok: removed.length > 0 };
    }
    if (action.finding.ecosystem === "pypi" || file === "requirements.txt") {
      const next = stripRequirementsLine(raw, action.finding.packageName || "");
      return { next, ok: next !== raw };
    }
    const next = removePackageJsonDependency(raw, action.finding.packageName || "");
    try {
      JSON.parse(next);
      return { next, ok: next !== raw };
    } catch {
      return { next: raw, ok: false };
    }
  }
  const version = action.version;
  if (!version || !action.finding.packageName) {
    return { next: raw, ok: false };
  }
  if (action.finding.surface === "mcp") {
    if (!action.finding.mcpId) {
      return { next: raw, ok: false };
    }
    const { next, pinned } = pinMcpServerById(raw, action.finding.mcpId, version);
    if (!pinned) {
      return { next: raw, ok: false };
    }
    try {
      JSON.parse(next);
      return { next, ok: true };
    } catch {
      return { next: raw, ok: false };
    }
  }
  if (action.finding.ecosystem === "pypi" || file === "requirements.txt") {
    const { next, changed } = pinRequirementVersion(raw, action.finding.packageName, version);
    return { next, ok: changed };
  }
  const { next, changed } = pinPackageJsonDependency(raw, action.finding.packageName, version);
  if (!changed) {
    return { next: raw, ok: false };
  }
  try {
    JSON.parse(next);
    return { next, ok: true };
  } catch {
    return { next: raw, ok: false };
  }
}
