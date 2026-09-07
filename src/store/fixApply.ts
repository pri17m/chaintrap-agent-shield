import { applyManifestEdit } from "./ecoManifest";
import { pinMcpServerById } from "./pinMcp";
import { removeMcpServerById, removeMcpServerByPackage } from "./uninstall";
import type { FixAction } from "./fixPlan";

export function applyFixToText(action: FixAction, raw: string, editPath?: string): { next: string; ok: boolean } {
  if (action.kind === "skip") {
    return { next: raw, ok: false };
  }
  if (action.finding.surface === "mcp") {
    if (action.kind === "delete") {
      const { next, removed } = action.finding.mcpId
        ? removeMcpServerById(raw, action.finding.mcpId)
        : removeMcpServerByPackage(raw, action.finding.packageName || "");
      return { next, ok: removed.length > 0 };
    }
    const version = action.version;
    if (!version || !action.finding.mcpId) {
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
  return applyManifestEdit(action, raw, editPath || action.finding.path);
}
