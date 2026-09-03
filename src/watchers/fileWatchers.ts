import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";

export function createWatchers(onChange: () => void): vscode.Disposable {
  const watchers: vscode.FileSystemWatcher[] = [];
  const globs = [
    "**/package.json",
    "**/package-lock.json",
    "**/pnpm-lock.yaml",
    "**/yarn.lock",
    "**/uv.lock",
    "**/requirements.txt",
    "**/.cursor/mcp.json",
    "**/.cursor/skills/**",
    "**/.cursor/commands/**",
    "**/.cursor/rules/**",
    "**/.claude/skills/**",
    "**/.claude/commands/**",
    "**/.claude/settings.json",
    "**/.claude/settings.local.json",
    "**/AGENTS.md",
    "**/CLAUDE.md",
    "**/MEMORY.md",
    "**/SOUL.md",
    "**/.cursorrules",
  ];
  for (const g of globs) {
    const w = vscode.workspace.createFileSystemWatcher(g);
    w.onDidChange(onChange);
    w.onDidCreate(onChange);
    w.onDidDelete(onChange);
    watchers.push(w);
  }
  const home = os.homedir();
  const homeWatchRoots: Array<{ dir: string; pattern: string }> = [
    { dir: path.join(home, ".cursor"), pattern: "mcp.json" },
    { dir: path.join(home, ".cursor", "skills"), pattern: "**/*" },
    { dir: path.join(home, ".cursor", "commands"), pattern: "**/*" },
    { dir: path.join(home, ".cursor", "rules"), pattern: "**/*" },
    { dir: path.join(home, ".claude", "skills"), pattern: "**/*" },
    { dir: path.join(home, ".claude", "commands"), pattern: "**/*" },
  ];
  for (const { dir, pattern } of homeWatchRoots) {
    const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(dir, pattern));
    w.onDidChange(onChange);
    w.onDidCreate(onChange);
    w.onDidDelete(onChange);
    watchers.push(w);
  }
  return vscode.Disposable.from(...watchers);
}
