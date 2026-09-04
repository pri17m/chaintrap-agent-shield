import * as vscode from "vscode";
import type { Finding } from "../types";
import { ackViewModel, type AckViewModel } from "./ackViewModel";

export type AckPanelResult = "ack" | "dismiss";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(webview: vscode.Webview, vm: AckViewModel): string {
  const nonce = [...Array(16)].map(() => Math.floor(Math.random() * 36).toString(36)).join("");
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");
  const osv = vm.osvIds.length
    ? `<div class="row"><span class="k">OSV</span><span class="v">${vm.osvIds.map(escapeHtml).join(", ")}</span></div>`
    : "";
  const pkg = vm.packageLabel
    ? `<div class="row"><span class="k">Package</span><span class="v mono">${escapeHtml(vm.packageLabel)}</span></div>`
    : "";
  const advisoryBtn = vm.advisoryUrl
    ? `<button type="button" id="advisory">Open advisory</button>`
    : "";
  const pillClass = vm.pill === "Malicious" || vm.pill === "Critical" ? "pill danger" : "pill warn";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy" content="${csp}"/>
  <style nonce="${nonce}">
    :root { color-scheme: dark; }
    body {
      margin: 0; padding: 24px 28px 20px;
      font-family: var(--vscode-font-family, Segoe UI, sans-serif);
      background: #0B1220; color: #E2E8F0;
    }
    .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
    .mark {
      width: 28px; height: 28px; border-radius: 6px;
      background: #14B8A6; color: #042F2E;
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 14px;
    }
    .brand h1 { margin: 0; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #94A3B8; font-weight: 600; }
    .pill {
      display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
      text-transform: uppercase; padding: 3px 8px; border-radius: 999px; margin-bottom: 10px;
    }
    .pill.danger { background: #7F1D1D; color: #FECACA; }
    .pill.warn { background: #78350F; color: #FDE68A; }
    h2 { margin: 0 0 12px; font-size: 18px; font-weight: 650; color: #F8FAFC; }
    .row { display: grid; grid-template-columns: 92px 1fr; gap: 8px; margin: 8px 0; font-size: 13px; }
    .k { color: #64748B; }
    .v { color: #E2E8F0; word-break: break-word; }
    .mono { font-family: var(--vscode-editor-font-family, Consolas, monospace); font-size: 12px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 22px; }
    button {
      border: 0; border-radius: 6px; padding: 8px 12px; cursor: pointer;
      font-size: 13px; background: #1E293B; color: #E2E8F0;
    }
    button.primary { background: #14B8A6; color: #042F2E; font-weight: 650; }
    button.ghost { background: transparent; color: #94A3B8; }
    .foot { margin-top: 18px; font-size: 12px; color: #64748B; }
  </style>
</head>
<body>
  <div class="brand">
    <div class="mark">C</div>
    <h1>Chaintrap finding</h1>
  </div>
  <span class="${pillClass}">${escapeHtml(vm.pill)}</span>
  <h2>${escapeHtml(vm.title)}</h2>
  <div class="row"><span class="k">Description</span><span class="v">${escapeHtml(vm.description)}</span></div>
  ${pkg}
  ${osv}
  <div class="row"><span class="k">File</span><span class="v mono" title="${escapeHtml(vm.filePath)}">${escapeHtml(vm.fileShort)}</span></div>
  <div class="actions">
    <button type="button" id="location">Open location</button>
    ${advisoryBtn}
    <button type="button" class="primary" id="ack">I understand the risk</button>
    <button type="button" class="ghost" id="dismiss">Dismiss</button>
  </div>
  <div class="foot">${vm.index} of ${vm.total}</div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById("location").addEventListener("click", () => vscode.postMessage({ type: "location" }));
    document.getElementById("ack").addEventListener("click", () => vscode.postMessage({ type: "ack" }));
    document.getElementById("dismiss").addEventListener("click", () => vscode.postMessage({ type: "dismiss" }));
    const adv = document.getElementById("advisory");
    if (adv) adv.addEventListener("click", () => vscode.postMessage({ type: "advisory" }));
  </script>
</body>
</html>`;
}

export async function promptFindingInPanel(
  finding: Finding,
  index: number,
  total: number,
): Promise<AckPanelResult> {
  const vm = ackViewModel(finding, index, total);
  const panel = vscode.window.createWebviewPanel(
    "chaintrap.findingAck",
    "Chaintrap finding",
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  panel.webview.html = renderHtml(panel.webview, vm);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: AckPanelResult) => {
      if (settled) {
        return;
      }
      settled = true;
      sub.dispose();
      closed.dispose();
      panel.dispose();
      resolve(result);
    };
    const sub = panel.webview.onDidReceiveMessage(async (msg: { type?: string }) => {
      if (msg.type === "location") {
        try {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(finding.path));
          await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: false });
        } catch (err) {
          void vscode.window.showErrorMessage(`Could not open ${finding.path}: ${String(err)}`);
        }
        return;
      }
      if (msg.type === "advisory" && finding.advisoryUrl) {
        await vscode.env.openExternal(vscode.Uri.parse(finding.advisoryUrl));
        return;
      }
      if (msg.type === "ack") {
        finish("ack");
        return;
      }
      if (msg.type === "dismiss") {
        finish("dismiss");
      }
    });
    const closed = panel.onDidDispose(() => finish("dismiss"));
  });
}
