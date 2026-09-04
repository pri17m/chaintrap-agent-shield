import * as vscode from "vscode";
import type { Finding } from "../types";
import type { StateStore } from "../store/stateStore";
import { needsAckPopup } from "./findingCopy";
import { promptFindingInPanel } from "./ackWebview";

export async function openFindingLocation(filePath: string): Promise<void> {
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: false });
  } catch (err) {
    void vscode.window.showErrorMessage(`Could not open ${filePath}: ${String(err)}`);
  }
}

export async function promptCriticalAcks(store: StateStore, findings: Finding[]): Promise<void> {
  const acks = store.getAcks();
  const pending = findings.filter((f) => needsAckPopup(f) && !acks[f.id]);
  const total = pending.length;
  for (let i = 0; i < pending.length; i++) {
    const f = pending[i];
    const result = await promptFindingInPanel(f, i + 1, total);
    if (result === "ack") {
      await store.acknowledge(f.id);
    }
  }
}
