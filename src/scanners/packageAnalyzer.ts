import type { Ecosystem, Finding, FindingSource, OsvQuery } from "../types";
import { classifyOsvIds, fetchOsvSummaries, pickPrimaryOsvId, queryOsvQuerybatch } from "../api/osvClient";
import { fetchLatestPackageVersion } from "../api/registryVersion";
import { ecosystemLabel } from "./ecosystems";
import { knownBadHealth, matchKnownBad } from "./knownBad";

export interface PackageToAnalyze {
  ecosystem: Ecosystem;
  name: string;
  version: string;
  path: string;
  workspaceRoot?: string;
  surface: "mcp" | "package";
  mcpId?: string;
  pinExact?: boolean;
  spec?: string;
  /** Set when this query is latest-on-registry for an unpinned MCP server. */
  resolvedLatest?: string;
}

function findingId(source: FindingSource, pkg: PackageToAnalyze): string {
  const mcp = pkg.mcpId ? `${pkg.mcpId}:` : "";
  return `${source}:${pkg.surface}:${pkg.ecosystem}:${pkg.name}@${pkg.version}:${mcp}${pkg.path}`;
}

function pkgFields(pkg: PackageToAnalyze): Pick<Finding, "path" | "packageName" | "version" | "ecosystem" | "workspaceRoot" | "mcpId" | "spec" | "resolvedVersion"> {
  return {
    path: pkg.path,
    packageName: pkg.name,
    version: pkg.version,
    ecosystem: pkg.ecosystem,
    workspaceRoot: pkg.workspaceRoot,
    mcpId: pkg.mcpId,
    spec: pkg.spec,
    resolvedVersion: pkg.resolvedLatest,
  };
}

function ecoLabel(eco: Ecosystem): string {
  return ecosystemLabel(eco);
}

export function packageFindingCopy(opts: {
  malicious: boolean;
  eco: Ecosystem;
  name: string;
  version: string;
  summary?: string;
  fallback: string;
  resolvedLatest?: string;
}): { title: string; message: string; summary: string } {
  const summary = (opts.summary || opts.fallback).trim();
  const title = opts.malicious
    ? `This ${ecoLabel(opts.eco)} package is malicious`
    : `This ${ecoLabel(opts.eco)} package is vulnerable`;
  const kind = opts.malicious ? "malicious" : "vulnerable";
  const latestNote = opts.resolvedLatest
    ? `\nUnpinned; latest on ${ecoLabel(opts.eco)} is ${opts.resolvedLatest} and that version is ${kind}. That is not a guarantee of what npx/pip will install.`
    : "";
  const message = `Description: ${summary}\nPackage: ${opts.name}@${opts.version}${latestNote}`;
  return { title, message, summary };
}

function unpinnedMcpFinding(
  pkg: PackageToAnalyze,
  source: FindingSource,
  now: string,
  opts: { latest?: string; unverified: boolean; osvDown?: boolean },
): Finding {
  const latest = opts.latest;
  const eco = ecoLabel(pkg.ecosystem);
  let message = "Version is unknown; OSV exact-version lookup skipped. Pin the version for a complete check.";
  if (!latest) {
    message =
      "Unpinned; latest on npm/PyPI could not be resolved. Not treated as safe. Pin the version for a complete check.";
  } else if (opts.osvDown) {
    message = `Unpinned; latest on ${eco} is ${latest} but OSV was unreachable. Not treated as safe.`;
  } else {
    message = `Unpinned; latest on ${eco} is ${latest}. No known malware or CVE on that version. That is not a guarantee of what npx/pip will install.`;
  }
  const unknownPkg = { ...pkg, version: "unknown", resolvedLatest: latest };
  return {
    id: findingId(source, unknownPkg) + ":unpinned",
    source,
    surface: "mcp",
    severity: "info",
    title: `Unpinned ${pkg.ecosystem} package ${pkg.name}`,
    message,
    ...pkgFields(unknownPkg),
    acknowledged: false,
    createdAt: now,
    unverifiedOnline: opts.unverified,
  };
}

export async function analyzePackages(
  packages: PackageToAnalyze[],
  source: FindingSource,
  fetchImpl?: typeof fetch,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const now = new Date().toISOString();
  const kb = knownBadHealth();
  if (!kb.ok) {
    findings.push({
      id: `${source}:extension:denylistUnavailable`,
      source,
      surface: "extension",
      severity: "info",
      title: "Denylist unavailable",
      message: `Known-bad denylist could not be loaded (${kb.error || "load_failed"}). Known-bad malware pins may be missed; OSV checks still run.`,
      path: kb.path,
      acknowledged: false,
      createdAt: now,
    });
  }
  const needOsv: PackageToAnalyze[] = [];
  const pendingLatest: PackageToAnalyze[] = [];

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
        resolvedLatest: pkg.resolvedLatest,
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
        ...pkgFields(pkg),
        advisoryUrl: kb.note.startsWith("http") ? kb.note : undefined,
        acknowledged: false,
        createdAt: now,
        malicious: true,
      });
    }
    if (!pkg.version || pkg.version === "unknown") {
      if (!kb && pkg.surface === "mcp") {
        pendingLatest.push(pkg);
        continue;
      }
      if (!kb) {
        const notExact = pkg.pinExact === false && pkg.surface === "package";
        findings.push({
          id: findingId(source, pkg) + ":unpinned",
          source,
          surface: pkg.surface,
          severity: "info",
          title: notExact
            ? `Non-exact ${pkg.ecosystem} spec ${pkg.name}`
            : `Unpinned ${pkg.ecosystem} package ${pkg.name}`,
          message: notExact
            ? `Spec ${pkg.spec || "unknown"} is not an exact pin; OSV exact-version lookup skipped.`
            : "Version is unknown; OSV exact-version lookup skipped. Pin the version for a complete check.",
          ...pkgFields(pkg),
          acknowledged: false,
          createdAt: now,
          unverifiedOnline: !notExact,
          coverageNote: notExact,
          coverageKind: notExact ? "not-exact" : undefined,
        });
      }
      continue;
    }
    needOsv.push(pkg);
  }

  for (const pkg of pendingLatest) {
    const latest = await fetchLatestPackageVersion(pkg.ecosystem, pkg.name, fetchImpl);
    if (!latest) {
      findings.push(unpinnedMcpFinding(pkg, source, now, { unverified: true }));
      continue;
    }
    const resolved: PackageToAnalyze = { ...pkg, version: latest, resolvedLatest: latest };
    const kbLatest = matchKnownBad(resolved.ecosystem, resolved.name, latest);
    if (kbLatest) {
      const copy = packageFindingCopy({
        malicious: true,
        eco: resolved.ecosystem,
        name: resolved.name,
        version: latest,
        summary: kbLatest.campaign ? `${kbLatest.campaign}: ${kbLatest.note || kbLatest.message}` : kbLatest.message,
        fallback: kbLatest.message,
        resolvedLatest: latest,
      });
      findings.push({
        id: findingId(source, resolved),
        source,
        surface: "mcp",
        severity: "critical",
        title: copy.title,
        message: copy.message,
        summary: copy.summary,
        ...pkgFields(resolved),
        advisoryUrl: kbLatest.note.startsWith("http") ? kbLatest.note : undefined,
        acknowledged: false,
        createdAt: now,
        malicious: true,
      });
      continue;
    }
    needOsv.push(resolved);
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
          malicious: existing.malicious === true,
          eco: pkg.ecosystem,
          name: pkg.name,
          version: pkg.version,
          summary: osvSummary,
          fallback: existing.summary || existing.message,
          resolvedLatest: pkg.resolvedLatest,
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
      if (pkg.resolvedLatest) {
        findings.push(
          unpinnedMcpFinding(pkg, source, now, { latest: pkg.resolvedLatest, unverified: true, osvDown: true }),
        );
        return;
      }
      findings.push({
        id: id + ":offline",
        source,
        surface: pkg.surface,
        severity: "info",
        title: `Could not verify ${pkg.name}@${pkg.version} online`,
        message: "OSV was unreachable. Package was not on the local known-bad list.",
        ...pkgFields(pkg),
        acknowledged: false,
        createdAt: now,
        unverifiedOnline: true,
      });
      return;
    }
    if (cls.severity === "info") {
      if (pkg.resolvedLatest) {
        findings.push(unpinnedMcpFinding(pkg, source, now, { latest: pkg.resolvedLatest, unverified: false }));
      }
      return;
    }
    const copy = packageFindingCopy({
      malicious: cls.malicious,
      eco: pkg.ecosystem,
      name: pkg.name,
      version: pkg.version,
      summary: osvSummary,
      fallback: `OSV findings: ${cls.ids.join(", ")}`,
      resolvedLatest: pkg.resolvedLatest,
    });
    findings.push({
      id,
      source,
      surface: pkg.surface,
      severity: cls.severity,
      title: copy.title,
      message: copy.message,
      summary: copy.summary,
      ...pkgFields(pkg),
      osvIds: cls.ids,
      advisoryUrl: cls.advisoryUrl,
      acknowledged: false,
      createdAt: now,
      malicious: cls.malicious,
    });
  });

  return findings;
}
