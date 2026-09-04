import type { Finding, InventoryItem } from "../types";
import {
  groupDependencyFindings,
  groupMcpFindings,
  isMaliciousFinding,
  isUnpinnedMcpFinding,
  isVulnerablePackageFinding,
} from "./findingGroups";

function unackedHighCritical(findings: Finding[]): number {
  return findings.filter((f) => !f.acknowledged && (f.severity === "critical" || f.severity === "high")).length;
}

export type WorkspaceMcpSource = "vscode" | "cursor";
export type PostureGroupKind = "attention" | "coverage" | "checked";

export interface InventorySummary {
  npmPins: number;
  pypiPins: number;
  mcpServers: number;
  skills: number;
  rules: number;
  workspaceMcpSources: WorkspaceMcpSource[];
  hasOpenFolder: boolean;
  scanning: boolean;
}

export const EMPTY_INVENTORY_SUMMARY: InventorySummary = {
  npmPins: 0,
  pypiPins: 0,
  mcpServers: 0,
  skills: 0,
  rules: 0,
  workspaceMcpSources: [],
  hasOpenFolder: false,
  scanning: false,
};

export interface PostureCommand {
  command: string;
  title: string;
  arguments?: string[];
}

export interface PostureRow {
  id: string;
  group: PostureGroupKind;
  label: string;
  count: number;
  tooltip?: string;
  command?: PostureCommand;
}

export interface PostureGroup {
  kind: PostureGroupKind;
  label: string;
  expanded: boolean;
  rows: PostureRow[];
}

export interface PostureModel {
  scanning: boolean;
  placeholder?: string;
  groups: PostureGroup[];
  statusText: string;
  statusTooltip: string;
  attentionBadge: number;
}

export function packagesChecked(summary: InventorySummary): number {
  return summary.npmPins + summary.pypiPins + summary.mcpServers;
}

export function summarizeInventory(items: InventoryItem[], hasOpenFolder: boolean): InventorySummary {
  const sources = new Set<WorkspaceMcpSource>();
  let npmPins = 0;
  let pypiPins = 0;
  let mcpServers = 0;
  let skills = 0;
  let rules = 0;
  for (const item of items) {
    if (item.kind === "package") {
      if (item.ecosystem === "pypi") {
        pypiPins += 1;
      } else if (item.ecosystem === "npm") {
        npmPins += 1;
      }
    } else if (item.kind === "mcp") {
      mcpServers += 1;
      if (item.workspaceRoot) {
        const p = item.path.replace(/\\/g, "/");
        if (p.endsWith("/.vscode/mcp.json") || p.endsWith(".vscode/mcp.json")) {
          sources.add("vscode");
        }
        if (p.endsWith("/.cursor/mcp.json") || p.endsWith(".cursor/mcp.json")) {
          sources.add("cursor");
        }
      }
    } else if (item.kind === "skill") {
      skills += 1;
    } else if (item.kind === "rule") {
      rules += 1;
    }
  }
  const workspaceMcpSources: WorkspaceMcpSource[] = [];
  if (sources.has("vscode")) {
    workspaceMcpSources.push("vscode");
  }
  if (sources.has("cursor")) {
    workspaceMcpSources.push("cursor");
  }
  return {
    npmPins,
    pypiPins,
    mcpServers,
    skills,
    rules,
    workspaceMcpSources,
    hasOpenFolder,
    scanning: false,
  };
}

export function coverageNoteFindings(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.coverageNote);
}

export function unverifiedOnlineFindings(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.unverifiedOnline && !isUnpinnedMcpFinding(f));
}

/** Actionable gaps for the status bar: lockfile, unpinned MCP, OSV unreachable. Skills/rules are excluded. */
export function actionableCoverageGapCount(findings: Finding[]): number {
  return coverageNoteFindings(findings).length + groupMcpFindings(findings).unpinned.length + unverifiedOnlineFindings(findings).length;
}

export function workspaceMcpSourceLabel(sources: WorkspaceMcpSource[]): string {
  const names = sources.map((s) => (s === "vscode" ? ".vscode/mcp.json" : ".cursor/mcp.json"));
  return `Workspace MCP: ${names.join(", ")}`;
}

export function buildPosture(findings: Finding[], summary: InventorySummary = EMPTY_INVENTORY_SUMMARY): PostureModel {
  const attentionBadge = unackedHighCritical(findings);
  const deps = groupDependencyFindings(findings);
  const mcp = groupMcpFindings(findings);
  const maliciousPkgs = deps.malicious.length;
  const maliciousMcp = mcp.malicious.length;
  const malicious = findings.filter(isMaliciousFinding).length;
  const vulnerable = findings.filter(isVulnerablePackageFinding).length;
  const unackedCrit = findings.filter((f) => !f.acknowledged && f.severity === "critical").length;
  const lockfileNotes = coverageNoteFindings(findings);
  const unpinned = mcp.unpinned;
  const unverified = unverifiedOnlineFindings(findings);
  const gaps = actionableCoverageGapCount(findings);
  const checked = packagesChecked(summary);
  const skillRuleCount = summary.skills + summary.rules;

  const statusText = statusTextFor(summary, malicious, unackedCrit, attentionBadge, gaps, checked);
  const statusTooltip = [
    `malicious ${malicious}`,
    `vulnerable ${vulnerable}`,
    `gaps ${gaps}`,
    `${checked} checked`,
  ].join(" · ");

  if (summary.scanning) {
    return {
      scanning: true,
      placeholder: "Scan in progress…",
      groups: [],
      statusText,
      statusTooltip,
      attentionBadge,
    };
  }

  const inventoryEmpty = checked === 0 && skillRuleCount === 0 && lockfileNotes.length === 0;
  if (!summary.hasOpenFolder && inventoryEmpty) {
    return {
      scanning: false,
      placeholder: "No open folder",
      groups: [],
      statusText,
      statusTooltip,
      attentionBadge,
    };
  }
  if (summary.hasOpenFolder && inventoryEmpty) {
    return {
      scanning: false,
      placeholder: "Nothing inventoried yet",
      groups: [],
      statusText,
      statusTooltip,
      attentionBadge,
    };
  }

  const attentionRows: PostureRow[] = [];
  if (maliciousPkgs > 0) {
    attentionRows.push({
      id: "maliciousPackages",
      group: "attention",
      label: `Malicious packages (${maliciousPkgs})`,
      count: maliciousPkgs,
      tooltip: "Known-bad or malware pins in workspace manifests or lockfiles.",
      command: { command: "chaintrap.activity.focus", title: "Show Dependencies" },
    });
  }
  if (maliciousMcp > 0) {
    attentionRows.push({
      id: "maliciousMcp",
      group: "attention",
      label: `Malicious MCP servers (${maliciousMcp})`,
      count: maliciousMcp,
      tooltip: "MCP server config pulls a known-bad or malware package.",
      command: { command: "chaintrap.mcp.focus", title: "Show MCP servers" },
    });
  }
  if (vulnerable > 0) {
    const vulnPkgs = deps.vulnerable.length;
    attentionRows.push({
      id: "vulnerable",
      group: "attention",
      label: `Vulnerable packages / MCP (${vulnerable})`,
      count: vulnerable,
      tooltip: "CVE or GHSA on a pinned package or MCP-inferred package.",
      command:
        vulnPkgs > 0
          ? { command: "chaintrap.activity.focus", title: "Show Dependencies" }
          : { command: "chaintrap.mcp.focus", title: "Show MCP servers" },
    });
  }
  if (attentionBadge > 0) {
    attentionRows.push({
      id: "unacked",
      group: "attention",
      label: `Unacknowledged high/critical (${attentionBadge})`,
      count: attentionBadge,
      tooltip: "Same set as the activity-bar badge and Acknowledge command.",
      command: { command: "chaintrap.acknowledgeFinding", title: "Acknowledge finding" },
    });
  }

  const coverageRows: PostureRow[] = [];
  if (lockfileNotes.length > 0) {
    coverageRows.push({
      id: "noLockfile",
      group: "coverage",
      label: `No lockfile — direct pins only (${lockfileNotes.length})`,
      count: lockfileNotes.length,
      tooltip: lockfileNotes.map((f) => f.message).join("\n") || "Add a lockfile to include transitive dependencies.",
      command: lockfileNotes[0]?.path
        ? { command: "chaintrap.openFindingLocation", title: "Open location", arguments: [lockfileNotes[0].path] }
        : undefined,
    });
  }
  if (unpinned.length > 0) {
    coverageRows.push({
      id: "unpinnedMcp",
      group: "coverage",
      label: `Unpinned MCP servers (${unpinned.length})`,
      count: unpinned.length,
      tooltip: "No version in the server config, so the pin could not be checked.",
      command: { command: "chaintrap.mcp.focus", title: "Show MCP servers" },
    });
  }
  if (unverified.length > 0) {
    coverageRows.push({
      id: "unverified",
      group: "coverage",
      label: `Could not verify online (${unverified.length})`,
      count: unverified.length,
      tooltip: "OSV was unreachable. Unknown packages are not treated as safe.",
    });
  }
  if (skillRuleCount > 0) {
    coverageRows.push({
      id: "skillsNotAnalyzed",
      group: "coverage",
      label: `Skills/rules inventoried, not analyzed (${skillRuleCount})`,
      count: skillRuleCount,
      tooltip: "Skill and rule files are listed for coverage. Heuristics stay off to avoid false positives.",
    });
  }

  const checkedRows: PostureRow[] = [
    {
      id: "checkedNpm",
      group: "checked",
      label: `npm pins (${summary.npmPins})`,
      count: summary.npmPins,
    },
    {
      id: "checkedPypi",
      group: "checked",
      label: `PyPI pins (${summary.pypiPins})`,
      count: summary.pypiPins,
    },
    {
      id: "checkedMcp",
      group: "checked",
      label: `MCP servers (${summary.mcpServers})`,
      count: summary.mcpServers,
    },
    {
      id: "checkedSkills",
      group: "checked",
      label: `Skills inventoried (${summary.skills})`,
      count: summary.skills,
    },
    {
      id: "checkedRules",
      group: "checked",
      label: `Rules inventoried (${summary.rules})`,
      count: summary.rules,
    },
  ];
  if (summary.workspaceMcpSources.length > 0) {
    checkedRows.push({
      id: "mcpSources",
      group: "checked",
      label: workspaceMcpSourceLabel(summary.workspaceMcpSources),
      count: summary.workspaceMcpSources.length,
      tooltip: "Workspace MCP configs included in this scan.",
    });
  }

  return {
    scanning: false,
    groups: [
      {
        kind: "attention",
        label: attentionRows.length > 0 ? `Attention needed (${attentionRows.length})` : "Attention needed",
        expanded: attentionRows.length > 0,
        rows: attentionRows,
      },
      {
        kind: "coverage",
        label: `Coverage gaps (${coverageRows.length})`,
        expanded: coverageRows.length > 0,
        rows: coverageRows,
      },
      {
        kind: "checked",
        label: "Checked this workspace",
        expanded: true,
        rows: checkedRows,
      },
    ],
    statusText,
    statusTooltip,
    attentionBadge,
  };
}

function statusTextFor(
  summary: InventorySummary,
  malicious: number,
  unackedCrit: number,
  attentionBadge: number,
  gaps: number,
  checked: number,
): string {
  if (summary.scanning) {
    return "Chaintrap: scanning workspace…";
  }
  if (malicious > 0) {
    return `Chaintrap: ${malicious} malicious`;
  }
  if (unackedCrit > 0) {
    return `Chaintrap: ${unackedCrit} critical`;
  }
  if (attentionBadge > 0) {
    return `Chaintrap: ${attentionBadge} high`;
  }
  if (gaps > 0) {
    return `Chaintrap: ${gaps} coverage gap${gaps === 1 ? "" : "s"}`;
  }
  if (checked === 0) {
    return "Chaintrap: workspace clear";
  }
  return `Chaintrap: ${checked} package${checked === 1 ? "" : "s"} checked`;
}
