import * as vscode from "vscode";
import { homeWatchRoots } from "./homeWatchRoots";

export type { HomeWatchRoot } from "./homeWatchRoots";
export { homeWatchRoots };

export function createWatchers(onChange: () => void): vscode.Disposable {
  const watchers: vscode.FileSystemWatcher[] = [];
  const globs = [
    "**/package.json",
    "**/package-lock.json",
    "**/pnpm-lock.yaml",
    "**/yarn.lock",
    "**/uv.lock",
    "**/poetry.lock",
    "**/Pipfile.lock",
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
  for (const { dir, pattern } of homeWatchRoots()) {
    const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(dir, pattern));
    w.onDidChange(onChange);
    w.onDidCreate(onChange);
    w.onDidDelete(onChange);
    watchers.push(w);
  }
  return vscode.Disposable.from(...watchers);
}
