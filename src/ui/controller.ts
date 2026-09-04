import * as vscode from "vscode";

import { analyzeItems } from "../scanners/itemAnalyzer";

import { inventoryUserConfig, inventoryWorkspaceRoot } from "../scanners/inventory";

import { diffItems } from "../store/diffEngine";

import type { StateStore } from "../store/stateStore";

import type { BaselineSnapshot, Finding, InventoryItem } from "../types";

import { promptCriticalAcks } from "./ackFlow";

import { AgentActivityProvider } from "./agentActivityTree";

import { countUnackedHighCritical } from "./findingCopy";

import { isManifestPackage, isMcpServerFinding } from "./findingGroups";

import { applyDeltaFindings, replaceBaselineFindings, scopeFindingsForDisplay, skipKeysCoveredByFindings } from "./findingMerge";

import { EMPTY_INVENTORY_SUMMARY, buildPosture, summarizeInventory, type InventorySummary } from "./postureModel";

import { PostureProvider } from "./postureTree";

import { ProblemsReporter } from "./problems";



function unchangedKeys(previous: BaselineSnapshot | undefined, current: InventoryItem[]): Set<string> {

  const skip = new Set<string>();

  if (!previous) {

    return skip;

  }

  for (const item of current) {

    const old = previous.items[item.key];

    if (old && old.hash === item.hash) {

      skip.add(item.key);

    }

  }

  return skip;

}



export class ShieldController {

  private debounce: NodeJS.Timeout | undefined;

  private baselineRunning = false;

  private deltaRunning = false;

  private lastSummary: InventorySummary = { ...EMPTY_INVENTORY_SUMMARY };



  constructor(

    private readonly store: StateStore,

    private readonly problems: ProblemsReporter,

    private readonly trees: AgentActivityProvider[],

    private readonly posture: PostureProvider,

    private readonly status: vscode.StatusBarItem,

    private readonly treeViews: vscode.TreeView<unknown>[] = [],

    private readonly postureView?: vscode.TreeView<unknown>,

  ) {}



  private openRootPaths(roots: readonly vscode.WorkspaceFolder[]): string[] {

    return roots.map((r) => r.uri.fsPath);

  }



  private displayFindings(all: Finding[], openRoots: readonly string[]): Finding[] {

    return scopeFindingsForDisplay(all, openRoots);

  }



  private refreshTrees(shown: Finding[]): void {

    for (const tree of this.trees) {

      tree.refresh(shown);

    }

  }



  private applyPosture(shown: Finding[]): void {

    this.posture.refresh(shown, this.lastSummary);

    const model = buildPosture(shown, this.lastSummary);

    this.status.text = model.statusText;

    this.status.tooltip = model.statusTooltip;

    if (this.postureView) {

      const count = model.attentionBadge;

      this.postureView.badge = count

        ? { value: count, tooltip: `${count} unacknowledged high/critical finding${count === 1 ? "" : "s"}` }

        : undefined;

    }

  }



  private updateBadge(findings: Finding[]): void {

    for (let i = 0; i < this.trees.length; i++) {

      const view = this.treeViews[i];

      if (!view) {

        continue;

      }

      const subset = findings.filter(this.trees[i].surface === "mcp" ? isMcpServerFinding : isManifestPackage);

      const count = countUnackedHighCritical(subset);

      view.badge = count

        ? { value: count, tooltip: `${count} unacknowledged high/critical finding${count === 1 ? "" : "s"}` }

        : undefined;

    }

  }



  private async publish(findings: Finding[], openRoots: readonly string[], promptAck: boolean): Promise<void> {

    await this.store.setFindings(findings);

    const shown = this.displayFindings(findings, openRoots);

    this.problems.refresh(shown);

    this.refreshTrees(shown);

    this.updateBadge(shown);

    this.applyPosture(shown);

    if (promptAck) {

      await promptCriticalAcks(this.store, shown);

      const after = this.store.getFindings();

      const shownAfter = this.displayFindings(after, openRoots);

      this.problems.refresh(shownAfter);

      this.refreshTrees(shownAfter);

      this.updateBadge(shownAfter);

      this.applyPosture(shownAfter);

    }

  }



  /** Re-publish UI after an external ack (command palette). */

  refreshUi(roots?: readonly vscode.WorkspaceFolder[]): void {

    const openRoots = roots ? this.openRootPaths(roots) : this.openRootPaths(vscode.workspace.workspaceFolders || []);

    const shown = this.displayFindings(this.store.getFindings(), openRoots);

    this.problems.refresh(shown);

    this.refreshTrees(shown);

    this.updateBadge(shown);

    this.applyPosture(shown);

  }



  async runBaseline(roots: readonly vscode.WorkspaceFolder[]): Promise<void> {

    if (this.baselineRunning) {

      return;

    }

    this.baselineRunning = true;

    try {

      this.status.text = "Chaintrap: scanning workspace…";

      this.status.tooltip = "Scan in progress";

      this.lastSummary = { ...this.lastSummary, scanning: true, hasOpenFolder: roots.length > 0 };

      this.posture.setScanning(this.lastSummary);

      const openRoots = this.openRootPaths(roots);

      const baselines = this.store.getBaselines();

      const userItems = inventoryUserConfig();

      const rootItems: InventoryItem[][] = roots.map((folder) => inventoryWorkspaceRoot(folder.uri.fsPath));

      const allItems: InventoryItem[] = [...userItems, ...rootItems.flat()];

      const candidateSkip = new Set<string>();
      for (const k of unchangedKeys(baselines["__user_config__"], userItems)) {
        candidateSkip.add(k);
      }
      roots.forEach((folder, i) => {
        for (const k of unchangedKeys(baselines[folder.uri.fsPath], rootItems[i])) {
          candidateSkip.add(k);
        }
      });
      const skipKeys = skipKeysCoveredByFindings(candidateSkip, allItems, this.store.getFindings());



      const findings = await analyzeItems(allItems, "baseline", undefined, { skipKeys });

      await this.store.setBaseline(this.store.snapshotFromItems("__user_config__", userItems));

      for (let i = 0; i < roots.length; i++) {

        await this.store.setBaseline(this.store.snapshotFromItems(roots[i].uri.fsPath, rootItems[i]));

      }



      this.lastSummary = summarizeInventory(allItems, openRoots.length > 0);

      const merged = replaceBaselineFindings(this.store.getFindings(), findings, this.store.getAcks(), openRoots, {

        skipKeys,

        liveItems: allItems,

      });

      await this.publish(merged, openRoots, true);

      const shown = this.displayFindings(this.store.getFindings(), openRoots);

      const crit = shown.filter((f) => f.severity === "critical" && !f.acknowledged).length;

      if (crit) {

        void vscode.window.showWarningMessage(`Chaintrap baseline found ${crit} critical issue(s).`);

      }

    } finally {

      this.baselineRunning = false;

    }

  }



  scheduleDelta(roots: readonly vscode.WorkspaceFolder[]): void {

    if (this.debounce) {

      clearTimeout(this.debounce);

    }

    this.debounce = setTimeout(() => {

      if (this.baselineRunning || this.deltaRunning) {

        this.scheduleDelta(roots);

        return;

      }

      void this.runDelta(roots);

    }, 2500);

  }



  async runDelta(roots: readonly vscode.WorkspaceFolder[]): Promise<void> {

    if (this.baselineRunning || this.deltaRunning) {

      this.scheduleDelta(roots);

      return;

    }

    this.deltaRunning = true;

    try {

      const openRoots = this.openRootPaths(roots);

      const baselines = this.store.getBaselines();

      const deltaItems: InventoryItem[] = [];

      const userItems = inventoryUserConfig();

      const userDiff = diffItems(baselines["__user_config__"], userItems);

      deltaItems.push(...userDiff.added, ...userDiff.changed);

      await this.store.setBaseline(this.store.snapshotFromItems("__user_config__", userItems));

      const livePaths = new Set<string>();
      const liveItems: InventoryItem[] = [];

      for (const it of userItems) {

        livePaths.add(it.path);
        liveItems.push(it);

      }

      for (const folder of roots) {

        const items = inventoryWorkspaceRoot(folder.uri.fsPath);

        for (const it of items) {

          livePaths.add(it.path);
          liveItems.push(it);

        }

        const diff = diffItems(baselines[folder.uri.fsPath], items);

        deltaItems.push(...diff.added, ...diff.changed);

        await this.store.setBaseline(this.store.snapshotFromItems(folder.uri.fsPath, items));

      }

      this.lastSummary = summarizeInventory(liveItems, openRoots.length > 0);

      if (deltaItems.length === 0) {

        // Still prune removed paths against live inventory

        const pruned = applyDeltaFindings(this.store.getFindings(), [], this.store.getAcks(), livePaths, openRoots, liveItems);

        if (pruned.length !== this.store.getFindings().length) {

          await this.publish(pruned, openRoots, false);

        } else {

          this.applyPosture(this.displayFindings(this.store.getFindings(), openRoots));

        }

        return;

      }

      const findings = await analyzeItems(deltaItems, "delta");

      const merged = applyDeltaFindings(this.store.getFindings(), findings, this.store.getAcks(), livePaths, openRoots, liveItems);

      await this.publish(merged, openRoots, true);

    } finally {

      this.deltaRunning = false;

    }

  }



  deltaSinceSession(): Finding[] {

    const started = this.store.sessionStartedAt();

    const openRoots = this.openRootPaths(vscode.workspace.workspaceFolders || []);

    return this.displayFindings(this.store.getFindings(), openRoots).filter(

      (f) => f.source === "delta" && f.createdAt >= started,

    );

  }

}


