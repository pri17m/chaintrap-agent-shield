import * as vscode from "vscode";

import type { Finding } from "../types";

import type { StateStore } from "../store/stateStore";

import { formatAckBody, needsAckPopup } from "./findingCopy";



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

  for (const f of pending) {

    // Loop until the user acks or dismisses (Cancel). Open location / advisory do not acknowledge.

    for (;;) {

      const buttons: string[] = ["Open location", "I understand the risk"];

      if (f.advisoryUrl) {

        buttons.splice(1, 0, "Open advisory");

      }

      const choice = await vscode.window.showErrorMessage(formatAckBody(f), { modal: true }, ...buttons);

      if (choice === "Open location") {

        await openFindingLocation(f.path);

        continue;

      }

      if (choice === "Open advisory" && f.advisoryUrl) {

        await vscode.env.openExternal(vscode.Uri.parse(f.advisoryUrl));

        continue;

      }

      if (choice === "I understand the risk") {

        await store.acknowledge(f.id);

      }

      break;

    }

  }

}

