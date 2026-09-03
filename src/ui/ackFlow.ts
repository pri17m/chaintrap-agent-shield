import * as vscode from "vscode";
import type { Finding } from "../types";
import type { StateStore } from "../store/stateStore";

export async function promptCriticalAcks(store: StateStore, findings: Finding[]): Promise<void> {
  const acks = store.getAcks();
  const pending = findings.filter((f) => f.severity === "critical" && !f.acknowledged && !acks[f.id]);
  for (const f of pending) {
    const choice = await vscode.window.showErrorMessage(
      `${f.title}\n${f.message}`,
      { modal: true },
      "I understand the risk",
      "Open advisory",
    );
    if (choice === "Open advisory" && f.advisoryUrl) {
      await vscode.env.openExternal(vscode.Uri.parse(f.advisoryUrl));
    }
    if (choice === "I understand the risk" || choice === "Open advisory") {
      await store.acknowledge(f.id);
    }
  }
}
