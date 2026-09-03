import type { Finding } from "../types";

export function needsAckPopup(f: Finding): boolean {
  if (f.acknowledged) {
    return false;
  }
  if (f.severity === "critical") {
    return true;
  }
  return (f.surface === "skill" || f.surface === "rule") && f.severity === "high";
}

/** Unacknowledged critical + high findings for the activity-bar badge. */
export function countUnackedHighCritical(findings: Finding[]): number {
  return findings.filter((f) => !f.acknowledged && (f.severity === "critical" || f.severity === "high")).length;
}

export function shortPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  if (parts.length <= 2) {
    return filePath;
  }
  return parts.slice(-2).join("/");
}

/** Tree rows always open the local file, never the advisory URL. */
export function findingTreeCommand(finding: Finding): { command: string; title: string; arguments: string[] } {
  return {
    command: "chaintrap.openFindingLocation",
    title: "Open location",
    arguments: [finding.path],
  };
}

export function formatAckBody(f: Finding): string {
  const description = f.summary || f.message;
  const lines = [f.title, "", `Description: ${description}`];
  if (f.packageName) {
    lines.push(`Package: ${f.packageName}@${f.version || "?"}`);
  }
  if (f.osvIds?.length) {
    lines.push(`OSV: ${f.osvIds.slice(0, 3).join(", ")}`);
  }
  lines.push(`File: ${f.path}`);
  return lines.join("\n");
}
