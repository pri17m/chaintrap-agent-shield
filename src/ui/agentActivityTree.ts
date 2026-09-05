import * as vscode from "vscode";
import type { Finding, Surface } from "../types";
import { findingTreeCommand, shortPath } from "./findingCopy";
import { groupDependencyFindings, groupMcpFindings } from "./findingGroups";

export type ActivityKind = "malicious" | "vulnerable" | "unpinned";
export type TreeSurface = Extract<Surface, "package" | "mcp">;

export class AgentActivityProvider implements vscode.TreeDataProvider<FindingItem | GroupItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<FindingItem | GroupItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private findings: Finding[] = [];

  constructor(readonly surface: TreeSurface) {}

  refresh(findings: Finding[]): void {
    this.findings = findings;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: FindingItem | GroupItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: FindingItem | GroupItem): (FindingItem | GroupItem)[] {
    if (this.surface === "mcp") {
      const grouped = groupMcpFindings(this.findings);
      if (!element) {
        return [
          new GroupItem("malicious", "mcp", `Malicious MCP servers (${grouped.malicious.length})`),
          new GroupItem("vulnerable", "mcp", `Vulnerable MCP servers (${grouped.vulnerable.length})`),
          new GroupItem("unpinned", "mcp", `Unpinned MCP servers (${grouped.unpinned.length})`),
        ];
      }
      if (element instanceof GroupItem) {
        const list =
          element.kind === "malicious"
            ? grouped.malicious
            : element.kind === "vulnerable"
              ? grouped.vulnerable
              : grouped.unpinned;
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
      return list.map((f) => new FindingItem(f, element.kind, "package"));
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
      kind === "malicious" ? "maliciousGroup" : kind === "vulnerable" ? "vulnerableGroup" : "unpinnedGroup";
    if (kind === "malicious") {
      this.tooltip =
        surface === "mcp"
          ? "MCP server config pulls a known-bad or malware package. Right-click to remove the server."
          : "Known-bad or malware package. Right-click a package to uninstall.";
    } else if (kind === "unpinned") {
      this.tooltip = "No version in the server config. Pin an exact version so the package can be checked.";
    }
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
      const pkg = finding.packageName ? `${finding.packageName}@${finding.version || "?"}` : "package";
      this.description = `${pkg} · ${shortPath(finding.path)}`;
    } else {
      const eco = finding.ecosystem === "pypi" ? "PyPI" : finding.ecosystem === "npm" ? "npm" : finding.surface;
      this.description = `${eco} · ${finding.source} · ${shortPath(finding.path)}`;
    }
    this.tooltip = finding.message;
    this.resourceUri = vscode.Uri.file(finding.path);
    this.command = findingTreeCommand(finding);
    if (kind === "malicious") {
      this.contextValue = surface === "mcp" ? "maliciousMcpServer" : "maliciousPackage";
    } else if (kind === "vulnerable") {
      this.contextValue = "vulnerablePackage";
    } else {
      this.contextValue = finding.ecosystem === "npm" ? "unpinnedMcpServer" : "unpinnedMcpOther";
    }
  }
}
