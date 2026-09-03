import * as vscode from "vscode";
import { analyzeItems } from "../scanners/itemAnalyzer";
import { inventoryUserConfig, inventoryWorkspaceRoot } from "../scanners/inventory";
import { diffItems } from "../store/diffEngine";
import type { StateStore } from "../store/stateStore";
import type { BaselineSnapshot, Finding, InventoryItem } from "../types";
import { promptCriticalAcks } from "./ackFlow";
import { AgentActivityProvider } from "./agentActivityTree";
import { countUnackedHighCritical } from "./findingCopy";
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

  constructor(
    private readonly store: StateStore,
    private readonly problems: ProblemsReporter,
    private readonly tree: AgentActivityProvider,
    private readonly status: vscode.StatusBarItem,
    private readonly treeView?: vscode.TreeView<unknown>,
  ) {}

  private updateBadge(findings: Finding[]): void {
    if (!this.treeView) {
      return;
    }
    const count = countUnackedHighCritical(findings);
    this.treeView.badge = count
      ? { value: count, tooltip: `${count} unacknowledged high/critical finding${count === 1 ? "" : "s"}` }
      : undefined;
  }

  private mergeFindings(incoming: Finding[]): Finding[] {
    const acks = this.store.getAcks();
    const existing = this.store.getFindings();
    const byId = new Map<string, Finding>();
    for (const f of existing) {
      byId.set(f.id, { ...f, acknowledged: Boolean(acks[f.id] || f.acknowledged) });
    }
    for (const f of incoming) {
      const prev = byId.get(f.id);
      byId.set(f.id, { ...f, acknowledged: Boolean(acks[f.id] || prev?.acknowledged) });
    }
    return [...byId.values()];
  }

  private async publish(findings: Finding[], promptAck: boolean): Promise<void> {
    await this.store.setFindings(findings);
    this.problems.refresh(findings);
    this.tree.refresh(findings);
    this.updateBadge(findings);
    const crit = findings.filter((f) => f.severity === "critical" && !f.acknowledged).length;
    this.status.text = crit ? `Chaintrap: ${crit} critical` : "Chaintrap: ready";
    if (promptAck) {
      await promptCriticalAcks(this.store, findings);
      const after = this.store.getFindings();
      this.problems.refresh(after);
      this.tree.refresh(after);
      this.updateBadge(after);
    }
  }

  /** Re-publish UI after an external ack (command palette). */
  refreshUi(): void {
    const findings = this.store.getFindings();
    this.problems.refresh(findings);
    this.tree.refresh(findings);
    this.updateBadge(findings);
  }

  async runBaseline(roots: readonly vscode.WorkspaceFolder[]): Promise<void> {
    this.baselineRunning = true;
    try {
      this.status.text = "Chaintrap: scanning workspace…";
      const baselines = this.store.getBaselines();
      const userItems = inventoryUserConfig();
      const rootItems: InventoryItem[][] = roots.map((folder) => inventoryWorkspaceRoot(folder.uri.fsPath));
      const allItems: InventoryItem[] = [...userItems, ...rootItems.flat()];

      const skipKeys = new Set<string>();
      for (const k of unchangedKeys(baselines["__user_config__"], userItems)) {
        skipKeys.add(k);
      }
      roots.forEach((folder, i) => {
        for (const k of unchangedKeys(baselines[folder.uri.fsPath], rootItems[i])) {
          skipKeys.add(k);
        }
      });

      const findings = await analyzeItems(allItems, "baseline", undefined, { skipKeys });
      await this.store.setBaseline(this.store.snapshotFromItems("__user_config__", userItems));
      for (let i = 0; i < roots.length; i++) {
        await this.store.setBaseline(this.store.snapshotFromItems(roots[i].uri.fsPath, rootItems[i]));
      }

      const merged = this.mergeFindings(findings);
      await this.publish(merged, true);
      const pkgs = allItems.filter((i) => i.kind === "package" || i.kind === "mcp").length;
      const skills = allItems.filter((i) => i.kind === "skill").length;
      const crit = merged.filter((f) => f.severity === "critical").length;
      this.status.text = `Chaintrap: baseline complete (${pkgs} packages, ${skills} skills)`;
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
      if (this.baselineRunning) {
        this.scheduleDelta(roots);
        return;
      }
      void this.runDelta(roots);
    }, 2500);
  }

  async runDelta(roots: readonly vscode.WorkspaceFolder[]): Promise<void> {
    const baselines = this.store.getBaselines();
    const deltaItems: InventoryItem[] = [];
    const userItems = inventoryUserConfig();
    const userDiff = diffItems(baselines["__user_config__"], userItems);
    deltaItems.push(...userDiff.added, ...userDiff.changed);
    await this.store.setBaseline(this.store.snapshotFromItems("__user_config__", userItems));
    for (const folder of roots) {
      const items = inventoryWorkspaceRoot(folder.uri.fsPath);
      const diff = diffItems(baselines[folder.uri.fsPath], items);
      deltaItems.push(...diff.added, ...diff.changed);
      await this.store.setBaseline(this.store.snapshotFromItems(folder.uri.fsPath, items));
    }
    if (deltaItems.length === 0) {
      return;
    }
    const findings = await analyzeItems(deltaItems, "delta");
    const merged = this.mergeFindings(findings);
    await this.publish(merged, true);
  }

  deltaSinceSession(): Finding[] {
    const started = this.store.sessionStartedAt();
    return this.store.getFindings().filter((f) => f.source === "delta" && f.createdAt >= started);
  }
}
