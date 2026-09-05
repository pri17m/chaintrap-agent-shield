import type { Finding } from "../types";
import { implicitSameMajorRange, isUnpinnableSpec, parseSemver } from "../scanners/pinSpec";
import {
  isMaliciousFinding,
  isUncheckedMcpFinding,
  isUnpinnedMcpFinding,
  isVulnerablePackageFinding,
} from "../ui/findingGroups";
import { pickCleanVersion } from "./pickCleanVersion";

export type FixKind = "delete" | "pin" | "skip";

export interface FixAction {
  kind: FixKind;
  finding: Finding;
  label: string;
  version?: string;
  spec?: string;
}

function findingLabel(f: Finding): string {
  if (f.surface === "mcp") {
    return f.mcpId || f.packageName || f.id;
  }
  return f.packageName || f.id;
}

function pinSpecFor(f: Finding): string | undefined {
  if (isUnpinnableSpec(f.spec || "")) {
    return undefined;
  }
  if (isVulnerablePackageFinding(f) && f.version && f.version !== "unknown") {
    return implicitSameMajorRange(f.version);
  }
  if (f.spec && f.spec.trim()) {
    return f.spec.trim();
  }
  if (isUnpinnedMcpFinding(f) || f.coverageKind === "not-exact" || !f.version || f.version === "unknown") {
    return "*";
  }
  return undefined;
}

export function shouldSkipFinding(f: Finding): string | undefined {
  if (f.surface === "skill" || f.surface === "rule") {
    return "skills/rules are not edited";
  }
  if (isUncheckedMcpFinding(f) || f.coverageKind === "unchecked-mcp") {
    return "not an npm/PyPI package";
  }
  if (f.coverageKind === "no-lockfile" || (f.coverageNote && !f.packageName && f.coverageKind !== "not-exact")) {
    return "lockfile coverage only";
  }
  if (!f.packageName) {
    return "no package name";
  }
  if (isUnpinnableSpec(f.spec || "")) {
    return "git/file/URL spec cannot be pinned";
  }
  return undefined;
}

function pinWhy(f: Finding, spec: string, laterMajor?: boolean): string {
  if (isVulnerablePackageFinding(f)) {
    return laterMajor
      ? "vulnerable (CVE/GHSA) — no clean same-major, highest OSV-clean later version"
      : "vulnerable (CVE/GHSA) — highest OSV-clean version in the same major";
  }
  if (f.coverageKind === "not-exact") {
    return `range ${spec} is not an exact pin — highest OSV-clean version in that range`;
  }
  if (isUnpinnedMcpFinding(f) || !f.version || f.version === "unknown") {
    if (f.spec && f.spec !== "*" && f.spec !== "unknown" && f.spec !== "latest") {
      return `no exact pin (spec ${f.spec}) — highest OSV-clean version in that range`;
    }
    return "no version in the config — highest published version that is OSV-clean";
  }
  return `spec ${spec} — highest OSV-clean version that fits`;
}

export function formatFixPreview(actions: FixAction[]): string {
  const deletes = actions.filter((a) => a.kind === "delete");
  const pins = actions.filter((a) => a.kind === "pin");
  const skips = actions.filter((a) => a.kind === "skip");
  const head = `${deletes.length} delete (malicious), ${pins.length} pin/upgrade, ${skips.length} skip. Edits manifests only (no npm/npx/pip).`;
  const blocks: string[] = [head];
  const take = (title: string, list: FixAction[]) => {
    if (list.length === 0) {
      return;
    }
    blocks.push(title);
    for (const a of list.slice(0, 8)) {
      blocks.push(`• ${a.label}`);
    }
    if (list.length > 8) {
      blocks.push(`…and ${list.length - 8} more`);
    }
  };
  take("DELETE — malware / denylist (remove from the manifest):", deletes);
  take("PIN / UPGRADE — write an exact OSV-clean version:", pins);
  take("SKIP — left unchanged:", skips);
  return blocks.join("\n");
}

export async function planFixActions(findings: Finding[], fetchImpl?: typeof fetch): Promise<FixAction[]> {
  const out: FixAction[] = [];
  for (const f of findings) {
    const skip = shouldSkipFinding(f);
    if (skip) {
      if (f.coverageKind === "no-lockfile" || f.surface === "skill" || f.surface === "rule") {
        continue;
      }
      out.push({ kind: "skip", finding: f, label: `Skip ${findingLabel(f)}: ${skip}` });
      continue;
    }
    if (isMaliciousFinding(f)) {
      const pin = `${f.packageName}@${f.version || "?"}`;
      const where = f.surface === "mcp" ? `MCP ${findingLabel(f)} (${pin})` : pin;
      out.push({
        kind: "delete",
        finding: f,
        label: `Delete ${where} because it is malicious (known-bad or OSV malware)`,
      });
      continue;
    }
    const spec = pinSpecFor(f);
    if (!spec || !f.packageName || !f.ecosystem) {
      continue;
    }
    let usedSpec = spec;
    let laterMajor = false;
    let picked = await pickCleanVersion({
      ecosystem: f.ecosystem,
      name: f.packageName,
      spec,
      fetchImpl,
    });
    if (!picked.version && isVulnerablePackageFinding(f) && f.version && f.version !== "unknown") {
      const parsed = parseSemver(f.version);
      if (parsed) {
        usedSpec = `>=${parsed.major}.${parsed.minor}.${parsed.patch}`;
        laterMajor = true;
        picked = await pickCleanVersion({
          ecosystem: f.ecosystem,
          name: f.packageName,
          spec: usedSpec,
          fetchImpl,
        });
      }
    }
    if (!picked.version) {
      out.push({
        kind: "skip",
        finding: f,
        spec: usedSpec,
        label: `Skip ${findingLabel(f)}: ${picked.reason || "no clean version in range"}`,
      });
      continue;
    }
    const from = f.spec || (f.version && f.version !== "unknown" ? f.version : "unpinned");
    out.push({
      kind: "pin",
      finding: f,
      version: picked.version,
      spec: usedSpec,
      label: `Pin ${findingLabel(f)} ${from} → ${f.packageName}@${picked.version} because ${pinWhy(f, usedSpec, laterMajor)}`,
    });
  }
  return out;
}
