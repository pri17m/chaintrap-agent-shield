import * as vscode from "vscode";

import { analyzeItems } from "../scanners/itemAnalyzer";

import { inventoryUserConfig, inventoryWorkspaceRoot } from "../scanners/inventory";

import { diffItems } from "../store/diffEngine";

import type { StateStore } from "../store/stateStore";

import type { BaselineSnapshot, Finding, InventoryItem } from "../types";

import { promptCriticalAcks } from "./ackFlow";

import { AgentActivityProvider } from "./agentActivityTree";

import { countUnackedHighCritical, statusBarText } from "./findingCopy";

import { applyDeltaFindings, replaceBaselineFindings, scopeFindingsForDisplay, skipKeysCoveredByFindings } from "./findingMerge";

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



  constructor(

    private readonly store: StateStore,

    private readonly problems: ProblemsReporter,

    private readonly tree: AgentActivityProvider,

    private readonly status: vscode.StatusBarItem,

    private readonly treeView?: vscode.TreeView<unknown>,

  ) {}



  private openRootPaths(roots: readonly vscode.WorkspaceFolder[]): string[] {

    return roots.map((r) => r.uri.fsPath);

  }



  private displayFindings(all: Finding[], openRoots: readonly string[]): Finding[] {

    return scopeFindingsForDisplay(all, openRoots);

  }



  private updateBadge(findings: Finding[]): void {

    if (!this.treeView) {

      return;

    }

    const count = countUnackedHighCritical(findings);

    this.treeView.badge = count

      ? { value: count, tooltip: `${count} unacknowledged high/critical finding${count === 1 ? "" : "s"}` }

      : undefined;

  }



  private async publish(findings: Finding[], openRoots: readonly string[], promptAck: boolean): Promise<void> {

    await this.store.setFindings(findings);

    const shown = this.displayFindings(findings, openRoots);

    this.problems.refresh(shown);

    this.tree.refresh(shown);

    this.updateBadge(shown);

    this.status.text = statusBarText(shown);

    if (promptAck) {

      await promptCriticalAcks(this.store, shown);

      const after = this.store.getFindings();

      const shownAfter = this.displayFindings(after, openRoots);

      this.problems.refresh(shownAfter);

      this.tree.refresh(shownAfter);

      this.updateBadge(shownAfter);

      this.status.text = statusBarText(shownAfter);

    }

  }



  /** Re-publish UI after an external ack (command palette). */

  refreshUi(roots?: readonly vscode.WorkspaceFolder[]): void {

    const openRoots = roots ? this.openRootPaths(roots) : this.openRootPaths(vscode.workspace.workspaceFolders || []);

    const shown = this.displayFindings(this.store.getFindings(), openRoots);

    this.problems.refresh(shown);

    this.tree.refresh(shown);

    this.updateBadge(shown);

    this.status.text = statusBarText(shown);

  }



  async runBaseline(roots: readonly vscode.WorkspaceFolder[]): Promise<void> {

    if (this.baselineRunning) {

      return;

    }

    this.baselineRunning = true;

    try {

      this.status.text = "Chaintrap: scanning workspace…";

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



      const merged = replaceBaselineFindings(this.store.getFindings(), findings, this.store.getAcks(), openRoots, {

        skipKeys,

        liveItems: allItems,

      });

      await this.publish(merged, openRoots, true);

      const pkgs = allItems.filter((i) => i.kind === "package" || i.kind === "mcp").length;

      const skills = allItems.filter((i) => i.kind === "skill").length;

      const shown = this.displayFindings(this.store.getFindings(), openRoots);

      const crit = shown.filter((f) => f.severity === "critical" && !f.acknowledged).length;

      this.status.text = `Chaintrap: baseline complete (${pkgs} packages, ${skills} skills)`;

      if (crit) {

        void vscode.window.showWarningMessage(`Chaintrap baseline found ${crit} critical issue(s).`);

      }

      // Restore status to reflect remaining unacked after optional warning

      this.status.text =

        countUnackedHighCritical(shown) > 0

          ? statusBarText(shown)

          : `Chaintrap: baseline complete (${pkgs} packages, ${skills} skills)`;

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

      for (const it of userItems) {

        livePaths.add(it.path);

      }

      for (const folder of roots) {

        const items = inventoryWorkspaceRoot(folder.uri.fsPath);

        for (const it of items) {

          livePaths.add(it.path);

        }

        const diff = diffItems(baselines[folder.uri.fsPath], items);

        deltaItems.push(...diff.added, ...diff.changed);

        await this.store.setBaseline(this.store.snapshotFromItems(folder.uri.fsPath, items));

      }

      if (deltaItems.length === 0) {

        // Still prune removed paths against live inventory

        const pruned = applyDeltaFindings(this.store.getFindings(), [], this.store.getAcks(), livePaths, openRoots);

        if (pruned.length !== this.store.getFindings().length) {

          await this.publish(pruned, openRoots, false);

        }

        return;

      }

      const findings = await analyzeItems(deltaItems, "delta");

      const merged = applyDeltaFindings(this.store.getFindings(), findings, this.store.getAcks(), livePaths, openRoots);

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


