import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import type { Finding } from "../types";
import { isMaliciousFinding } from "./findingGroups";
import {
  removeMcpServerById,
  removeMcpServerByPackage,
  removePackageJsonDependency,
  stripRequirementsLine,
  uninstallConfirmLabel,
} from "../store/uninstall";

function sameFsPath(a: string, b: string): boolean {
  return path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase();
}

function readTextFile(filePath: string): string {
  const open = vscode.workspace.textDocuments.find((d) => sameFsPath(d.uri.fsPath, filePath));
  if (open) {
    return open.getText();
  }
  return fs.readFileSync(filePath, "utf8");
}

async function writeTextFile(filePath: string, contents: string): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  const open = vscode.workspace.textDocuments.find((d) => sameFsPath(d.uri.fsPath, filePath));
  if (open) {
    const edit = new vscode.WorkspaceEdit();
    const end = open.lineAt(Math.max(open.lineCount - 1, 0)).range.end;
    edit.replace(open.uri, new vscode.Range(new vscode.Position(0, 0), end), contents);
    const ok = await vscode.workspace.applyEdit(edit);
    if (ok) {
      if (open.isDirty) {
        await open.save();
      }
      return;
    }
  }
  await vscode.workspace.fs.writeFile(uri, Buffer.from(contents, "utf8"));
}

function findManifest(finding: Finding, fileName: string): string | undefined {
  if (path.basename(finding.path).toLowerCase() === fileName.toLowerCase() && fs.existsSync(finding.path)) {
    return finding.path;
  }
  const dirs = [path.dirname(finding.path), finding.workspaceRoot].filter((d): d is string => Boolean(d));
  for (const dir of dirs) {
    const p = path.join(dir, fileName);
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return undefined;
}

export async function uninstallMaliciousFinding(finding: Finding): Promise<boolean> {
  if (!isMaliciousFinding(finding) || !finding.packageName) {
    void vscode.window.showWarningMessage("Only malicious packages can be uninstalled from this view.");
    return false;
  }
  const label = uninstallConfirmLabel(finding);
  const prompt =
    finding.surface === "mcp"
      ? `Remove ${label}? This deletes that server from the MCP config, not every server that uses the same package.`
      : `Uninstall ${label}? This removes it from the manifest. It does not run npm/pip.`;
  const choice = await vscode.window.showWarningMessage(prompt, { modal: true }, "Uninstall");
  if (choice !== "Uninstall") {
    return false;
  }

  try {
    if (finding.surface === "mcp") {
      const raw = readTextFile(finding.path);
      const { next, removed } = finding.mcpId
        ? removeMcpServerById(raw, finding.mcpId)
        : removeMcpServerByPackage(raw, finding.packageName);
      if (removed.length === 0) {
        void vscode.window.showWarningMessage(`Could not find an MCP server for ${finding.mcpId || finding.packageName}.`);
        return false;
      }
      await writeTextFile(finding.path, next);
      void vscode.window.showInformationMessage(`Removed MCP server(s): ${removed.join(", ")}.`);
      return true;
    }

    if (finding.ecosystem === "pypi") {
      const req = findManifest(finding, "requirements.txt");
      if (!req) {
        void vscode.window.showWarningMessage(`No requirements.txt found to remove ${finding.packageName}.`);
        return false;
      }
      const next = stripRequirementsLine(readTextFile(req), finding.packageName);
      await writeTextFile(req, next);
      void vscode.window.showInformationMessage(`Removed ${finding.packageName} from requirements.`);
      return true;
    }

    if (finding.ecosystem === "npm") {
      const pkgJson = findManifest(finding, "package.json");
      if (!pkgJson) {
        void vscode.window.showWarningMessage(`No package.json found to remove ${finding.packageName}.`);
        return false;
      }
      const next = removePackageJsonDependency(readTextFile(pkgJson), finding.packageName);
      await writeTextFile(pkgJson, next);
      void vscode.window.showInformationMessage(`Removed ${finding.packageName} from package.json.`);
      return true;
    }

    void vscode.window.showWarningMessage("Unsupported ecosystem for uninstall.");
    return false;
  } catch (err) {
    void vscode.window.showErrorMessage(`Uninstall failed: ${String(err)}`);
    return false;
  }
}
