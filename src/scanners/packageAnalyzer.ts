import type { Ecosystem, Finding, FindingSource, OsvQuery } from "../types";
import { classifyOsvIds, queryOsvQuerybatch } from "../api/osvClient";
import { matchKnownBad } from "./knownBad";

export interface PackageToAnalyze {
  ecosystem: Ecosystem;
  name: string;
  version: string;
  path: string;
  workspaceRoot?: string;
  surface: "mcp" | "package";
}

function findingId(source: FindingSource, pkg: PackageToAnalyze): string {
  return `${source}:${pkg.surface}:${pkg.ecosystem}:${pkg.name}@${pkg.version}:${pkg.path}`;
}

export async function analyzePackages(
  packages: PackageToAnalyze[],
  source: FindingSource,
  fetchImpl?: typeof fetch,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const now = new Date().toISOString();
  const needOsv: { pkg: PackageToAnalyze; index: number }[] = [];

  for (const pkg of packages) {
    const kb = matchKnownBad(pkg.ecosystem, pkg.name, pkg.version);
    if (kb) {
      findings.push({
        id: findingId(source, pkg),
        source,
        surface: pkg.surface,
        severity: "critical",
        title: `Known-bad ${pkg.ecosystem} package ${pkg.name}@${pkg.version}`,
        message: kb.message,
        path: pkg.path,
        packageName: pkg.name,
        version: pkg.version,
        ecosystem: pkg.ecosystem,
        advisoryUrl: kb.note.startsWith("http") ? kb.note : undefined,
        acknowledged: false,
        workspaceRoot: pkg.workspaceRoot,
        createdAt: now,
      });
      continue;
    }
    if (!pkg.version || pkg.version === "unknown") {
      findings.push({
        id: findingId(source, pkg) + ":unpinned",
        source,
        surface: pkg.surface,
        severity: "info",
        title: `Unpinned ${pkg.ecosystem} package ${pkg.name}`,
        message: "Version is unknown; OSV exact-version lookup skipped. Pin the version for a complete check.",
        path: pkg.path,
        packageName: pkg.name,
        version: pkg.version,
        ecosystem: pkg.ecosystem,
        acknowledged: false,
        workspaceRoot: pkg.workspaceRoot,
        createdAt: now,
        unverifiedOnline: true,
      });
      continue;
    }
    needOsv.push({ pkg, index: findings.length });
  }

  const queries: OsvQuery[] = needOsv.map(({ pkg }) => ({
    ecosystem: pkg.ecosystem,
    name: pkg.name,
    version: pkg.version,
  }));
  let osvOk = true;
  let osvResults: Awaited<ReturnType<typeof queryOsvQuerybatch>>["results"] = [];
  try {
    const batch = await queryOsvQuerybatch(queries, fetchImpl);
    osvOk = batch.ok;
    osvResults = batch.results;
  } catch {
    osvOk = false;
  }

  needOsv.forEach(({ pkg }, i) => {
    const vulns = osvResults[i] || [];
    if (!osvOk && vulns.length === 0) {
      findings.push({
        id: findingId(source, pkg) + ":offline",
        source,
        surface: pkg.surface,
        severity: "info",
        title: `Could not verify ${pkg.name}@${pkg.version} online`,
        message: "OSV was unreachable. Package was not on the local known-bad list.",
        path: pkg.path,
        packageName: pkg.name,
        version: pkg.version,
        ecosystem: pkg.ecosystem,
        acknowledged: false,
        workspaceRoot: pkg.workspaceRoot,
        createdAt: now,
        unverifiedOnline: true,
      });
      return;
    }
    const cls = classifyOsvIds(vulns);
    if (cls.severity === "info") {
      return;
    }
    findings.push({
      id: findingId(source, pkg),
      source,
      surface: pkg.surface,
      severity: cls.severity,
      title:
        cls.severity === "critical"
          ? `Malicious ${pkg.ecosystem} package ${pkg.name}@${pkg.version}`
          : `Vulnerable ${pkg.ecosystem} package ${pkg.name}@${pkg.version}`,
      message: `OSV findings: ${(cls.ids || []).join(", ")}`,
      path: pkg.path,
      packageName: pkg.name,
      version: pkg.version,
      ecosystem: pkg.ecosystem,
      osvIds: cls.ids,
      advisoryUrl: cls.advisoryUrl,
      acknowledged: false,
      workspaceRoot: pkg.workspaceRoot,
      createdAt: now,
    });
  });

  return findings;
}
