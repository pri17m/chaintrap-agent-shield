import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { applyFixToText } from "../store/fixApply";
import { formatFixPreview, planFixActions, type FixAction } from "../store/fixPlan";
import type { Finding } from "../types";
import { readWorkspaceText, writeWorkspaceText } from "./workspaceText";

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

export function resolveFixPath(action: FixAction): string | undefined {
  const f = action.finding;
  if (f.surface === "mcp") {
    return f.path;
  }
  if (f.ecosystem === "pypi") {
    return findManifest(f, "requirements.txt");
  }
  return findManifest(f, "package.json");
}

export async function applyFixActions(actions: FixAction[]): Promise<Finding[]> {
  const texts = new Map<string, string>();
  const succeeded: Finding[] = [];
  for (const action of actions) {
    if (action.kind === "skip") {
      continue;
    }
    const filePath = resolveFixPath(action);
    if (!filePath) {
      continue;
    }
    const raw = texts.has(filePath) ? texts.get(filePath)! : readWorkspaceText(filePath);
    const { next, ok } = applyFixToText(action, raw);
    if (!ok) {
      continue;
    }
    if (filePath.toLowerCase().endsWith(".json")) {
      try {
        JSON.parse(next);
      } catch {
        continue;
      }
    }
    texts.set(filePath, next);
    succeeded.push(action.finding);
  }
  for (const [filePath, contents] of texts) {
    await writeWorkspaceText(filePath, contents);
  }
  return succeeded;
}

export async function runFixIssues(findings: Finding[], fetchImpl?: typeof fetch): Promise<Finding[] | undefined> {
  const actions = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Planning Fix issues…" },
    async () => planFixActions(findings, fetchImpl),
  );
  const actionable = actions.filter((a) => a.kind !== "skip");
  if (actionable.length === 0) {
    const skips = actions.filter((a) => a.kind === "skip");
    void vscode.window.showInformationMessage(
      skips.length
        ? `Nothing to fix automatically.\n${skips
            .slice(0, 8)
            .map((s) => s.label)
            .join("\n")}`
        : "Nothing to fix automatically.",
    );
    return undefined;
  }
  const choice = await vscode.window.showWarningMessage(formatFixPreview(actions), { modal: true }, "Fix issues");
  if (choice !== "Fix issues") {
    return undefined;
  }
  const applied = await applyFixActions(actions);
  void vscode.window.showInformationMessage(
    applied.length ? `Applied ${applied.length} fix${applied.length === 1 ? "" : "es"}.` : "No files were changed.",
  );
  return applied;
}
