import type { Finding } from "../types";
import { buildPosture, EMPTY_INVENTORY_SUMMARY, type InventorySummary } from "./postureModel";



/** Findings the user must (or can) acknowledge — critical + all high. */

export function needsAckPopup(f: Finding): boolean {

  if (f.acknowledged) {

    return false;

  }

  return f.severity === "critical" || f.severity === "high";

}



/** Badge counts the same set as needsAckPopup. */

export function countUnackedHighCritical(findings: Finding[]): number {

  return findings.filter((f) => needsAckPopup(f)).length;

}

/** Map a finding to Problems panel level. `skip` means do not emit a diagnostic. */
export function diagnosticLevelForFinding(f: Finding): "error" | "warning" | "information" | "skip" {
  if (f.acknowledged && (f.severity === "critical" || f.severity === "high")) {
    return "skip";
  }
  if (f.severity === "critical" || f.severity === "high") {
    return "error";
  }
  if (f.coverageNote) {
    return "information";
  }
  if (f.severity === "info" && f.unverifiedOnline) {
    return "warning";
  }
  if (f.severity === "info") {
    return "skip";
  }
  return "warning";
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



export function statusBarText(findings: Finding[], summary?: InventorySummary): string {
  return buildPosture(findings, summary ?? EMPTY_INVENTORY_SUMMARY).statusText;
}

export function statusBarTooltip(findings: Finding[], summary?: InventorySummary): string {
  return buildPosture(findings, summary ?? EMPTY_INVENTORY_SUMMARY).statusTooltip;
}


