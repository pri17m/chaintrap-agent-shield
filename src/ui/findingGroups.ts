import type { Finding } from "../types";

export function isPackageLike(f: Finding): boolean {
  return (f.surface === "package" || f.surface === "mcp") && Boolean(f.packageName);
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

export function groupDependencyFindings(findings: Finding[]): {
  malicious: Finding[];
  vulnerable: Finding[];
} {
  return {
    malicious: findings.filter(isMaliciousFinding),
    vulnerable: findings.filter(isVulnerablePackageFinding),
  };
}
