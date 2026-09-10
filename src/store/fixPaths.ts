import { resolveWritableManifestPath } from "./ecoManifest";
import type { FixAction } from "./fixPlan";

export function resolveFixPath(action: FixAction): string | undefined {
  if (action.finding.surface === "mcp") {
    // Fix issues only edits workspace-scoped configs, never user-level home configs.
    return action.finding.workspaceRoot ? action.finding.path : undefined;
  }
  return resolveWritableManifestPath(action.finding);
}

