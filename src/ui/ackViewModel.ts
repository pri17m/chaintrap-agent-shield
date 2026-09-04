import type { Finding } from "../types";
import { shortPath } from "./findingCopy";

export type AckPill = "Malicious" | "Vulnerable" | "Critical" | "High";

export interface AckViewModel {
  id: string;
  title: string;
  description: string;
  packageLabel?: string;
  osvIds: string[];
  filePath: string;
  fileShort: string;
  advisoryUrl?: string;
  pill: AckPill;
  index: number;
  total: number;
}

export function ackPill(f: Finding): AckPill {
  if (f.malicious) {
    return "Malicious";
  }
  if (/vulnerable/i.test(f.title)) {
    return "Vulnerable";
  }
  if (f.severity === "critical") {
    return "Critical";
  }
  return "High";
}

export function ackViewModel(f: Finding, index: number, total: number): AckViewModel {
  const description = (f.summary || f.message.replace(/^Description:\s*/i, "")).trim();
  return {
    id: f.id,
    title: f.title,
    description,
    packageLabel: f.packageName ? `${f.packageName}@${f.version || "?"}` : undefined,
    osvIds: (f.osvIds || []).slice(0, 3),
    filePath: f.path,
    fileShort: shortPath(f.path),
    advisoryUrl: f.advisoryUrl,
    pill: ackPill(f),
    index,
    total,
  };
}
