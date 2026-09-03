import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";

export function createWatchers(
  onChange: () => void,
): vscode.Disposable {
  const watchers: vscode.FileSystemWatcher[] = [];
  const globs = [
    "**/package.json",
    "**/package-lock.json",
    "**/pnpm-lock.yaml",
    "**/yarn.lock",
    "**/uv.lock",
    "**/requirements.txt",
    "**/.cursor/mcp.json",
    "**/.cursor/skills/**/SKILL.md",
    "**/.cursor/rules/**",
    "**/.claude/skills/**/SKILL.md",
    "**/AGENTS.md",
    "**/.cursorrules",
  ];
  for (const g of globs) {
    const w = vscode.workspace.createFileSystemWatcher(g);
    w.onDidChange(onChange);
    w.onDidCreate(onChange);
    w.onDidDelete(onChange);
    watchers.push(w);
  }
  const homeGlobs = [
    path.join(os.homedir(), ".cursor", "mcp.json"),
    path.join(os.homedir(), ".cursor", "skills", "**", "SKILL.md"),
  ];
  for (const abs of homeGlobs) {
    const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(path.dirname(abs), path.basename(abs)));
    w.onDidChange(onChange);
    w.onDidCreate(onChange);
    watchers.push(w);
  }
  return vscode.Disposable.from(...watchers);
}
