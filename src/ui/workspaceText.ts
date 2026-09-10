import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { userConfigPaths } from "../scanners/inventory";
import { safeExistingFilePath } from "../security/pathSafety";

function sameFsPath(a: string, b: string): boolean {
  return path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase();
}

function allowedRoots(): string[] {
  return (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath).filter(Boolean);
}

function allowedExactUserConfigFiles(): string[] {
  // Only allow direct edits of user-level MCP config(s). Skills/rules are not written by this extension.
  if (!vscode.workspace.isTrusted) {
    return [];
  }
  return userConfigPaths().mcp;
}

function assertSafeReadWriteTarget(filePath: string): void {
  const check = safeExistingFilePath(filePath, { allowedRoots: allowedRoots(), allowedExactFiles: allowedExactUserConfigFiles() });
  if (check.ok) {
    return;
  }
  const msg =
    check.reason === "symlink"
      ? `Refusing to access symlink path: ${filePath}`
      : check.reason === "outside_allowed_roots"
        ? `Refusing to access file outside the workspace or allowed config paths: ${filePath}`
        : `Refusing to access unsafe path (${check.reason}): ${filePath}`;
  throw new Error(msg);
}

export function readWorkspaceText(filePath: string): string {
  assertSafeReadWriteTarget(filePath);
  const open = vscode.workspace.textDocuments.find((d) => sameFsPath(d.uri.fsPath, filePath));
  if (open) {
    return open.getText();
  }
  return fs.readFileSync(filePath, "utf8");
}

export async function writeWorkspaceText(filePath: string, contents: string): Promise<void> {
  if (!vscode.workspace.isTrusted) {
    throw new Error("Refusing to modify files in an untrusted workspace. Trust this workspace to enable Fix issues / Pin / Uninstall.");
  }
  assertSafeReadWriteTarget(filePath);
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
