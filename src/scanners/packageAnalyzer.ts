import type { Ecosystem, Finding, FindingSource, OsvQuery } from "../types";
import { classifyOsvIds, fetchOsvSummaries, pickPrimaryOsvId, queryOsvQuerybatch } from "../api/osvClient";
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

function ecoLabel(eco: Ecosystem): string {
  return eco === "pypi" ? "PyPI" : "npm";
}

export function packageFindingCopy(opts: {
  malicious: boolean;
  eco: Ecosystem;
  name: string;
  version: string;
  summary?: string;
  fallback: string;
}): { title: string; message: string; summary: string } {
  const summary = (opts.summary || opts.fallback).trim();
  const title = opts.malicious
    ? `This ${ecoLabel(opts.eco)} package is malicious`
    : `This ${ecoLabel(opts.eco)} package is vulnerable`;
  const message = `Description: ${summary}\nPackage: ${opts.name}@${opts.version}`;
  return { title, message, summary };
}

export async function analyzePackages(
  packages: PackageToAnalyze[],
  source: FindingSource,
  fetchImpl?: typeof fetch,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const now = new Date().toISOString();
  const needOsv: PackageToAnalyze[] = [];

  for (const pkg of packages) {
    const kb = matchKnownBad(pkg.ecosystem, pkg.name, pkg.version);
    if (kb) {
      const copy = packageFindingCopy({
        malicious: true,
        eco: pkg.ecosystem,
        name: pkg.name,
        version: pkg.version,
        summary: kb.campaign ? `${kb.campaign}: ${kb.note || kb.message}` : kb.message,
        fallback: kb.message,
      });
      const id = findingId(source, pkg);
      findings.push({
        id,
        source,
        surface: pkg.surface,
        severity: "critical",
        title: copy.title,
        message: copy.message,
        summary: copy.summary,
        path: pkg.path,
        packageName: pkg.name,
        version: pkg.version,
        ecosystem: pkg.ecosystem,
        advisoryUrl: kb.note.startsWith("http") ? kb.note : undefined,
        acknowledged: false,
        workspaceRoot: pkg.workspaceRoot,
        createdAt: now,
      });
    }
    if (!pkg.version || pkg.version === "unknown") {
      if (!kb) {
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
      }
      continue;
    }
    needOsv.push(pkg);
  }

  const queries: OsvQuery[] = needOsv.map((pkg) => ({
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

  const primaryIds: string[] = [];
  const classified = needOsv.map((pkg, i) => {
    const vulns = osvResults[i] || [];
    const cls = classifyOsvIds(vulns);
    const primary = pickPrimaryOsvId(cls.ids);
    if (primary) {
      primaryIds.push(primary);
    }
    return { pkg, cls, primary };
  });
  const summaries = await fetchOsvSummaries(primaryIds, fetchImpl);

  const byId = new Map(findings.map((f) => [f.id, f]));

  classified.forEach(({ pkg, cls, primary }) => {
    const id = findingId(source, pkg);
    const osvSummary = primary ? summaries[primary] : undefined;
    const existing = byId.get(id);
    if (existing) {
      if (osvSummary) {
        const copy = packageFindingCopy({
          malicious: true,
          eco: pkg.ecosystem,
          name: pkg.name,
          version: pkg.version,
          summary: osvSummary,
          fallback: existing.summary || existing.message,
        });
        existing.title = copy.title;
        existing.message = copy.message;
        existing.summary = copy.summary;
        existing.osvIds = cls.ids.length ? cls.ids : existing.osvIds;
        existing.advisoryUrl = cls.advisoryUrl || existing.advisoryUrl;
      }
      return;
    }
    if (!osvOk && cls.ids.length === 0) {
      findings.push({
        id: id + ":offline",
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
    if (cls.severity === "info") {
      return;
    }
    const copy = packageFindingCopy({
      malicious: cls.malicious,
      eco: pkg.ecosystem,
      name: pkg.name,
      version: pkg.version,
      summary: osvSummary,
      fallback: `OSV findings: ${cls.ids.join(", ")}`,
    });
    findings.push({
      id,
      source,
      surface: pkg.surface,
      severity: cls.severity,
      title: copy.title,
      message: copy.message,
      summary: copy.summary,
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
