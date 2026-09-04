import * as vscode from "vscode";
import { buildPosture, EMPTY_INVENTORY_SUMMARY, type InventorySummary, type PostureGroup, type PostureModel, type PostureRow } from "./postureModel";
import type { Finding } from "../types";

export class PostureProvider implements vscode.TreeDataProvider<PostureGroupItem | PostureRowItem | PosturePlaceholderItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    PostureGroupItem | PostureRowItem | PosturePlaceholderItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private model: PostureModel = buildPosture([], { ...EMPTY_INVENTORY_SUMMARY, scanning: true });

  refresh(findings: Finding[], summary: InventorySummary): void {
    this.model = buildPosture(findings, summary);
    this._onDidChangeTreeData.fire(undefined);
  }

  setScanning(summary: InventorySummary): void {
    this.refresh([], { ...summary, scanning: true });
  }

  getTreeItem(element: PostureGroupItem | PostureRowItem | PosturePlaceholderItem): vscode.TreeItem {
    return element;
  }

  getChildren(
    element?: PostureGroupItem | PostureRowItem | PosturePlaceholderItem,
  ): (PostureGroupItem | PostureRowItem | PosturePlaceholderItem)[] {
    if (this.model.placeholder) {
      if (element) {
        return [];
      }
      return [new PosturePlaceholderItem(this.model.placeholder, this.model.scanning)];
    }
    if (!element) {
      return this.model.groups.map((g) => new PostureGroupItem(g));
    }
    if (element instanceof PostureGroupItem) {
      return element.group.rows.map((row) => new PostureRowItem(row));
    }
    return [];
  }
}

export class PosturePlaceholderItem extends vscode.TreeItem {
  constructor(label: string, scanning: boolean) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "posturePlaceholder";
    this.iconPath = new vscode.ThemeIcon(scanning ? "sync" : "info");
  }
}

export class PostureGroupItem extends vscode.TreeItem {
  constructor(readonly group: PostureGroup) {
    super(
      group.label,
      group.expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
    );
    this.contextValue = `postureGroup.${group.kind}`;
    this.iconPath =
      group.kind === "attention"
        ? new vscode.ThemeIcon("warning")
        : group.kind === "coverage"
          ? new vscode.ThemeIcon("info")
          : new vscode.ThemeIcon("pass");
  }
}

export class PostureRowItem extends vscode.TreeItem {
  constructor(readonly row: PostureRow) {
    super(row.label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = `postureRow.${row.id}`;
    this.tooltip = row.tooltip;
    if (row.command) {
      this.command = row.command;
    }
  }
}
