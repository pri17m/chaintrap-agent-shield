import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

function sameFsPath(a: string, b: string): boolean {
  return path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase();
}

export function readWorkspaceText(filePath: string): string {
  const open = vscode.workspace.textDocuments.find((d) => sameFsPath(d.uri.fsPath, filePath));
  if (open) {
    return open.getText();
  }
  return fs.readFileSync(filePath, "utf8");
}

export async function writeWorkspaceText(filePath: string, contents: string): Promise<void> {
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
