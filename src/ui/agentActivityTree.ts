import * as vscode from "vscode";
import { ecosystemLabel } from "../scanners/ecosystems";
import type { Finding, Surface } from "../types";
import { findingTreeCommand, shortPath } from "./findingCopy";
import { groupDependencyFindings, groupFindingsByEcosystem, groupMcpFindings } from "./findingGroups";

export type ActivityKind = "malicious" | "vulnerable" | "unpinned" | "unchecked";
export type TreeSurface = Extract<Surface, "package" | "mcp">;

export type ActivityTreeNode = FindingItem | GroupItem | EcoGroupItem;

export class AgentActivityProvider implements vscode.TreeDataProvider<ActivityTreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<ActivityTreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private findings: Finding[] = [];

  constructor(readonly surface: TreeSurface) {}

  refresh(findings: Finding[]): void {
    this.findings = findings;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ActivityTreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ActivityTreeNode): ActivityTreeNode[] {
    if (this.surface === "mcp") {
      const grouped = groupMcpFindings(this.findings);
      if (!element) {
        return [
          new GroupItem("malicious", "mcp", `Malicious MCP servers (${grouped.malicious.length})`),
          new GroupItem("vulnerable", "mcp", `Vulnerable MCP servers (${grouped.vulnerable.length})`),
          new GroupItem("unpinned", "mcp", `Unpinned MCP servers (${grouped.unpinned.length})`),
          new GroupItem("unchecked", "mcp", `Unchecked MCP servers (${grouped.unchecked.length})`),
        ];
      }
      if (element instanceof GroupItem) {
        const list =
          element.kind === "malicious"
            ? grouped.malicious
            : element.kind === "vulnerable"
              ? grouped.vulnerable
              : element.kind === "unpinned"
                ? grouped.unpinned
                : grouped.unchecked;
        return list.map((f) => new FindingItem(f, element.kind, "mcp"));
      }
      return [];
    }

    const grouped = groupDependencyFindings(this.findings);
    if (!element) {
      return [
        new GroupItem("malicious", "package", `Malicious packages (${grouped.malicious.length})`),
        new GroupItem("vulnerable", "package", `Vulnerable packages (${grouped.vulnerable.length})`),
      ];
    }
    if (element instanceof GroupItem) {
      const list = element.kind === "malicious" ? grouped.malicious : grouped.vulnerable;
      return groupFindingsByEcosystem(list).map(
        (g) => new EcoGroupItem(element.kind, g.ecosystem, `${g.label} (${g.findings.length})`, g.findings),
      );
    }
    if (element instanceof EcoGroupItem) {
      return element.findings.map((f) => new FindingItem(f, element.kind, "package"));
    }
    return [];
  }
}

export class GroupItem extends vscode.TreeItem {
  constructor(
    readonly kind: ActivityKind,
    readonly surface: TreeSurface,
    label: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue =
      kind === "malicious"
        ? "maliciousGroup"
        : kind === "vulnerable"
          ? "vulnerableGroup"
          : kind === "unpinned"
            ? "unpinnedGroup"
            : "uncheckedGroup";
    if (kind === "malicious") {
      this.tooltip =
        surface === "mcp"
          ? "MCP server config pulls a known-bad or malware package. Right-click to remove the server."
          : "Known-bad or malware package. Right-click a package to uninstall.";
    } else if (kind === "unpinned") {
      this.tooltip =
        "No exact version in the server config. Latest published on npm/PyPI is checked when the registry is reachable.";
    } else if (kind === "unchecked") {
      this.tooltip = "URL, docker, or binary MCP servers — not npm/PyPI packages, so they are listed only.";
    }
  }
}

export class EcoGroupItem extends vscode.TreeItem {
  constructor(
    readonly kind: ActivityKind,
    readonly ecosystem: string,
    label: string,
    readonly findings: Finding[],
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = "ecosystemGroup";
    this.tooltip = `${label} in this workspace`;
  }
}

export class FindingItem extends vscode.TreeItem {
  constructor(
    readonly finding: Finding,
    kind: ActivityKind,
    surface: TreeSurface,
  ) {
    const name =
      surface === "mcp"
        ? finding.mcpId || finding.packageName || finding.title
        : finding.packageName
          ? `${finding.packageName}@${finding.version || "?"}`
          : finding.title;
    super(name, vscode.TreeItemCollapsibleState.None);
    if (surface === "mcp") {
      const detail = finding.packageName
        ? `${finding.packageName}@${finding.version || "?"}`
        : finding.mcpUrl || finding.mcpCommand || "not a package";
      this.description = `${detail} · ${shortPath(finding.path)}`;
    } else {
      const eco = finding.ecosystem ? ecosystemLabel(finding.ecosystem) : finding.surface;
      this.description = `${eco} · ${finding.source} · ${shortPath(finding.path)}`;
    }
    this.tooltip = finding.message;
    this.resourceUri = vscode.Uri.file(finding.path);
    this.command = findingTreeCommand(finding);
    if (kind === "malicious") {
      this.contextValue = surface === "mcp" ? "maliciousMcpServer" : "maliciousPackage";
    } else if (kind === "vulnerable") {
      this.contextValue = "vulnerablePackage";
    } else if (kind === "unchecked") {
      this.contextValue = "uncheckedMcpServer";
    } else {
      this.contextValue = finding.ecosystem === "npm" ? "unpinnedMcpServer" : "unpinnedMcpOther";
    }
  }
}
