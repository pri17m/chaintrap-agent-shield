import * as vscode from "vscode";
import { fetchLatestPackageVersion } from "../api/registryVersion";
import { isPinVersion, pinMcpServerById, suggestedPinVersion } from "../store/pinMcp";
import type { Finding } from "../types";
import { isUnpinnedMcpFinding } from "./findingGroups";
import { readWorkspaceText, writeWorkspaceText } from "./workspaceText";

export async function resolveLatestPinVersion(
  finding: Finding,
  fetchImpl?: typeof fetch,
): Promise<string | undefined> {
  const cached = suggestedPinVersion(finding);
  if (cached) {
    return cached;
  }
  if (!finding.packageName) {
    return undefined;
  }
  return fetchLatestPackageVersion(finding.ecosystem === "pypi" ? "pypi" : "npm", finding.packageName, fetchImpl ?? fetch);
}

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

  const cached = suggestedPinVersion(finding);
  const latest =
    cached ||
    (await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Looking up latest ${finding.packageName}…` },
      async () => resolveLatestPinVersion(finding),
    ));

  let pin: string | undefined;
  if (latest) {
    const picked = await vscode.window.showQuickPick(
      [
        {
          label: `Pin latest (${latest})`,
          description: `${finding.packageName}@${latest}`,
          detail: "Latest published on npm. Not a guarantee of what npx will install later.",
          version: latest,
        },
        {
          label: "Enter a different exact version…",
          description: finding.packageName,
          version: "",
        },
      ],
      {
        title: `Pin MCP server ${finding.mcpId}`,
        placeHolder: "Writes package@version into mcp.json. Does not run npx/npm.",
        ignoreFocusOut: true,
      },
    );
    if (!picked) {
      return false;
    }
    if (picked.version) {
      pin = picked.version;
    }
  }

  if (!pin) {
    const typed = await vscode.window.showInputBox({
      title: `Pin MCP server ${finding.mcpId}`,
      prompt: latest
        ? `Latest on npm is ${latest}. Writes ${finding.packageName}@<version> into mcp.json.`
        : `Could not resolve latest ${finding.packageName}. Enter an exact version.`,
      value: latest || "",
      placeHolder: latest ? latest : "1.2.3",
      ignoreFocusOut: true,
      validateInput: (v) => (isPinVersion(v) ? undefined : "Use an exact version like 1.2.3 (not latest or a range)."),
    });
    if (typed === undefined) {
      return false;
    }
    pin = typed.trim();
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
