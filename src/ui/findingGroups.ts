import { ECOSYSTEMS, ecosystemLabel } from "../scanners/ecosystems";
import type { Ecosystem, Finding } from "../types";

export interface EcosystemFindingGroup {
  ecosystem: string;
  label: string;
  findings: Finding[];
}

/** Keep ecosystem order from ECOSYSTEMS so Maven/crates are not buried under npm. */
export function groupFindingsByEcosystem(findings: Finding[]): EcosystemFindingGroup[] {
  const map = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = f.ecosystem || "other";
    const list = map.get(key);
    if (list) {
      list.push(f);
    } else {
      map.set(key, [f]);
    }
  }
  const order = [...ECOSYSTEMS, "other"];
  const out: EcosystemFindingGroup[] = [];
  for (const key of order) {
    const list = map.get(key);
    if (!list?.length) {
      continue;
    }
    const label = key === "other" ? "other" : ecosystemLabel(key as Ecosystem);
    out.push({ ecosystem: key, label, findings: list });
    map.delete(key);
  }
  for (const [key, list] of map) {
    out.push({ ecosystem: key, label: key, findings: list });
  }
  return out;
}

export function isManifestPackage(f: Finding): boolean {
  return f.surface === "package" && Boolean(f.packageName);
}

export function isMcpServerFinding(f: Finding): boolean {
  return f.surface === "mcp" && Boolean(f.packageName);
}

export function isPackageLike(f: Finding): boolean {
  return isManifestPackage(f) || isMcpServerFinding(f);
}

export function isUncheckedMcpFinding(f: Finding): boolean {
  return f.surface === "mcp" && !f.packageName;
}

export function isUnpinnedMcpFinding(f: Finding): boolean {
  if (!isMcpServerFinding(f)) {
    return false;
  }
  if (isMaliciousFinding(f) || isVulnerablePackageFinding(f)) {
    return false;
  }
  return !f.version || f.version === "unknown";
}

export function isMaliciousFinding(f: Finding): boolean {
  if (!isPackageLike(f) || f.unverifiedOnline) {
    return false;
  }
  if (f.malicious === true) {
    return true;
  }
  if (f.malicious === false) {
    return false;
  }
  return Boolean(f.osvIds?.some((id) => id.startsWith("MAL-"))) || /is malicious/i.test(f.title);
}

export function isVulnerablePackageFinding(f: Finding): boolean {
  if (!isPackageLike(f) || f.unverifiedOnline || isMaliciousFinding(f)) {
    return false;
  }
  return f.severity !== "info" && f.severity !== "low";
}

function groupRisk(findings: Finding[], pred: (f: Finding) => boolean): { malicious: Finding[]; vulnerable: Finding[] } {
  return {
    malicious: findings.filter((f) => pred(f) && isMaliciousFinding(f)),
    vulnerable: findings.filter((f) => pred(f) && isVulnerablePackageFinding(f)),
  };
}

export function groupDependencyFindings(findings: Finding[]): { malicious: Finding[]; vulnerable: Finding[] } {
  return groupRisk(findings, isManifestPackage);
}

export function groupMcpFindings(findings: Finding[]): {
  malicious: Finding[];
  vulnerable: Finding[];
  unpinned: Finding[];
  unchecked: Finding[];
} {
  return {
    ...groupRisk(findings, isMcpServerFinding),
    unpinned: findings.filter(isUnpinnedMcpFinding),
    unchecked: findings.filter(isUncheckedMcpFinding),
  };
}
