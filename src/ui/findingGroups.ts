import type { Finding } from "../types";

export function isManifestPackage(f: Finding): boolean {
  return f.surface === "package" && Boolean(f.packageName);
}

export function isMcpServerFinding(f: Finding): boolean {
  return f.surface === "mcp" && Boolean(f.packageName);
}

export function isPackageLike(f: Finding): boolean {
  return isManifestPackage(f) || isMcpServerFinding(f);
}

export function isUnpinnedMcpFinding(f: Finding): boolean {
  if (!isMcpServerFinding(f)) {
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
} {
  return {
    ...groupRisk(findings, isMcpServerFinding),
    unpinned: findings.filter(isUnpinnedMcpFinding),
  };
}
