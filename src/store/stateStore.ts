import * as vscode from "vscode";
import type { BaselineSnapshot, Finding, InventoryItem } from "../types";
import { persistableItem } from "../scanners/inventory";

const BASELINE_KEY = "chaintrap.baselines.v1";
const FINDINGS_KEY = "chaintrap.findings.v1";
const ACK_KEY = "chaintrap.acks.v1";
const SESSION_KEY = "chaintrap.sessionStartedAt";
const LAST_FIX_KEY = "chaintrap.lastFixAt";
const LAST_CLEARED_KEY = "chaintrap.lastClearedAt";
const DENYLIST_WARNED_KEY = "chaintrap.denylistWarned.v1";

export class StateStore {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  getBaselines(): Record<string, BaselineSnapshot> {
    return this.ctx.globalState.get<Record<string, BaselineSnapshot>>(BASELINE_KEY, {});
  }

  async setBaseline(snapshot: BaselineSnapshot): Promise<void> {
    const all = this.getBaselines();
    all[snapshot.workspaceRoot] = snapshot;
    await this.ctx.globalState.update(BASELINE_KEY, all);
  }

  getFindings(): Finding[] {
    return this.ctx.globalState.get<Finding[]>(FINDINGS_KEY, []);
  }

  async setFindings(findings: Finding[]): Promise<void> {
    await this.ctx.globalState.update(FINDINGS_KEY, findings);
  }

  getAcks(): Record<string, string> {
    return this.ctx.globalState.get<Record<string, string>>(ACK_KEY, {});
  }

  async acknowledge(id: string): Promise<void> {
    const acks = this.getAcks();
    acks[id] = new Date().toISOString();
    await this.ctx.globalState.update(ACK_KEY, acks);
    const findings = this.getFindings().map((f) => (f.id === id ? { ...f, acknowledged: true } : f));
    await this.setFindings(findings);
  }

  sessionStartedAt(): string {
    const existing = this.ctx.workspaceState.get<string>(SESSION_KEY);
    if (existing) {
      return existing;
    }
    const now = new Date().toISOString();
    void this.ctx.workspaceState.update(SESSION_KEY, now);
    return now;
  }

  getLastFixAt(): string | undefined {
    return this.ctx.workspaceState.get<string>(LAST_FIX_KEY);
  }

  getLastClearedAt(): string | undefined {
    return this.ctx.workspaceState.get<string>(LAST_CLEARED_KEY);
  }

  denylistWarned(): boolean {
    return Boolean(this.ctx.workspaceState.get<boolean>(DENYLIST_WARNED_KEY));
  }

  async recordDenylistWarned(): Promise<void> {
    await this.ctx.workspaceState.update(DENYLIST_WARNED_KEY, true);
  }

  async recordFixApplied(): Promise<string> {
    const now = new Date().toISOString();
    await this.ctx.workspaceState.update(LAST_FIX_KEY, now);
    return now;
  }

  async recordCleared(): Promise<string> {
    const now = new Date().toISOString();
    await this.ctx.workspaceState.update(LAST_CLEARED_KEY, now);
    return now;
  }

  snapshotFromItems(workspaceRoot: string, items: InventoryItem[]): BaselineSnapshot {
    const map: Record<string, InventoryItem> = {};
    for (const item of items) {
      map[item.key] = persistableItem(item);
    }
    return { workspaceRoot, scannedAt: new Date().toISOString(), items: map };
  }
}
