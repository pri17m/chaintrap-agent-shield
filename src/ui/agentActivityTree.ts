import * as vscode from "vscode";
import type { Finding } from "../types";
import { findingTreeCommand, shortPath } from "./findingCopy";
import { groupDependencyFindings } from "./findingGroups";

export type ActivityKind = "malicious" | "vulnerable";

export class AgentActivityProvider implements vscode.TreeDataProvider<FindingItem | GroupItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<FindingItem | GroupItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private findings: Finding[] = [];

  refresh(findings: Finding[]): void {
    this.findings = findings;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: FindingItem | GroupItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: FindingItem | GroupItem): (FindingItem | GroupItem)[] {
    const { malicious, vulnerable } = groupDependencyFindings(this.findings);
    if (!element) {
      return [
        new GroupItem("malicious", `Malicious packages (${malicious.length})`),
        new GroupItem("vulnerable", `Vulnerable packages (${vulnerable.length})`),
      ];
    }
    if (element instanceof GroupItem) {
      const list = element.kind === "malicious" ? malicious : vulnerable;
      return list.map((f) => new FindingItem(f, element.kind));
    }
    return [];
  }
}

export class GroupItem extends vscode.TreeItem {
  constructor(
    readonly kind: ActivityKind,
    label: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = kind === "malicious" ? "maliciousGroup" : "vulnerableGroup";
    if (kind === "malicious") {
      this.tooltip = "Known-bad or OSV malware. Right-click a package to uninstall.";
    }
  }
}

export class FindingItem extends vscode.TreeItem {
  constructor(
    readonly finding: Finding,
    kind: ActivityKind,
  ) {
    const name = finding.packageName ? `${finding.packageName}@${finding.version || "?"}` : finding.title;
    super(name, vscode.TreeItemCollapsibleState.None);
    const eco = finding.ecosystem === "pypi" ? "PyPI" : finding.ecosystem === "npm" ? "npm" : finding.surface;
    this.description = `${eco} · ${finding.source} · ${shortPath(finding.path)}`;
    this.tooltip = finding.message;
    this.resourceUri = vscode.Uri.file(finding.path);
    this.command = findingTreeCommand(finding);
    this.contextValue = kind === "malicious" ? "maliciousPackage" : "vulnerablePackage";
  }
}
