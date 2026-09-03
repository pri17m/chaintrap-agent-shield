import * as vscode from "vscode";
import type { Finding } from "../types";

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
    if (!element) {
      return [
        new GroupItem("baseline", "Baseline (already installed)"),
        new GroupItem("delta", "Delta (agent changes)"),
      ];
    }
    if (element instanceof GroupItem) {
      return this.findings
        .filter((f) => f.source === element.source)
        .map((f) => new FindingItem(f));
    }
    return [];
  }
}

class GroupItem extends vscode.TreeItem {
  constructor(
    readonly source: "baseline" | "delta",
    label: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = "group";
  }
}

class FindingItem extends vscode.TreeItem {
  constructor(finding: Finding) {
    super(`[${finding.severity}] ${finding.title}`, vscode.TreeItemCollapsibleState.None);
    this.description = finding.source;
    this.tooltip = finding.message;
    this.resourceUri = vscode.Uri.file(finding.path);
    if (finding.advisoryUrl) {
      this.command = {
        command: "vscode.open",
        title: "Open advisory",
        arguments: [vscode.Uri.parse(finding.advisoryUrl)],
      };
    } else {
      this.command = {
        command: "vscode.open",
        title: "Open file",
        arguments: [vscode.Uri.file(finding.path)],
      };
    }
  }
}
