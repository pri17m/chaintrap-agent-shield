import * as vscode from "vscode";
import { fetchLatestPackageVersion } from "../api/registryVersion";
import { isPinVersion, pinMcpServerById } from "../store/pinMcp";
import type { Finding } from "../types";
import { isUnpinnedMcpFinding } from "./findingGroups";
import { readWorkspaceText, writeWorkspaceText } from "./workspaceText";

export async function pinMcpFinding(finding: Finding): Promise<boolean> {
  if (!isUnpinnedMcpFinding(finding) || !finding.mcpId || !finding.packageName) {
    void vscode.window.showWarningMessage("Only unpinned MCP servers can be pinned from this view.");
    return false;
  }
  if (finding.ecosystem && finding.ecosystem !== "npm") {
    void vscode.window.showWarningMessage(
      "Pin writes package@version into npx args. Python/-m servers are not pinned this way.",
    );
    return false;
  }

  const latest = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Looking up latest ${finding.packageName}…` },
    async () => fetchLatestPackageVersion(finding.ecosystem === "pypi" ? "pypi" : "npm", finding.packageName!),
  );

  const version = await vscode.window.showInputBox({
    title: `Pin MCP server ${finding.mcpId}`,
    prompt: `Writes ${finding.packageName}@<version> into mcp.json. Does not run npx/npm.`,
    value: latest || "",
    placeHolder: latest ? `latest on npm is ${latest}` : "1.2.3",
    ignoreFocusOut: true,
    validateInput: (v) => (isPinVersion(v) ? undefined : "Use an exact version like 1.2.3 (not latest or a range)."),
  });
  if (version === undefined) {
    return false;
  }
  const pin = version.trim();
  const label = `${finding.mcpId} → ${finding.packageName}@${pin}`;
  const choice = await vscode.window.showInformationMessage(
    `Pin ${label}? This edits the MCP config only.`,
    { modal: true },
    "Pin",
  );
  if (choice !== "Pin") {
    return false;
  }

  try {
    const raw = readWorkspaceText(finding.path);
    const { next, pinned, packageName } = pinMcpServerById(raw, finding.mcpId, pin);
    if (!pinned) {
      void vscode.window.showWarningMessage(
        `Could not pin ${finding.mcpId}. The config needs an npx-style package argument.`,
      );
      return false;
    }
    await writeWorkspaceText(finding.path, next);
    void vscode.window.showInformationMessage(`Pinned ${finding.mcpId} to ${packageName}@${pin}.`);
    return true;
  } catch (err) {
    void vscode.window.showErrorMessage(`Pin failed: ${String(err)}`);
    return false;
  }
}
