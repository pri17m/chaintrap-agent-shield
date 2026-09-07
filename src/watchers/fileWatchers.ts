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
    "**/bun.lock",
    "**/uv.lock",
    "**/poetry.lock",
    "**/Pipfile.lock",
    "**/pdm.lock",
    "**/pylock.toml",
    "**/pyproject.toml",
    "**/requirements.txt",
    "**/pom.xml",
    "**/go.mod",
    "**/go.sum",
    "**/Cargo.lock",
    "**/Cargo.toml",
    "**/Gemfile.lock",
    "**/gems.locked",
    "**/Gemfile",
    "**/packages.lock.json",
    "**/packages.config",
    "**/*.deps.json",
    "**/composer.lock",
    "**/composer.json",
    "**/pubspec.lock",
    "**/pubspec.yaml",
    "**/mix.lock",
    "**/mix.exs",
    "**/Package.resolved",
    "**/Package.swift",
    "**/conanfile.txt",
    "**/conanfile.py",
    "**/cabal.project.freeze",
    "**/stack.yaml.lock",
    "**/renv.lock",
    "**/conan.lock",
    "**/gradle.lockfile",
    "**/buildscript-gradle.lockfile",
    "**/verification-metadata.xml",
    "**/build.gradle",
    "**/build.gradle.kts",
    "**/.github/workflows/*.yml",
    "**/.github/workflows/*.yaml",
    "**/.cursor/mcp.json",
    "**/.vscode/mcp.json",
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
