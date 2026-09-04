import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import type { Finding } from "../types";
import { isMaliciousFinding } from "./findingGroups";
import {
  removeMcpServerByPackage,
  removePackageJsonDependency,
  stripRequirementsLine,
  uninstallConfirmLabel,
} from "../store/uninstall";

function npmBin(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function pipBin(): string {
  return process.platform === "win32" ? "pip" : "pip";
}

function run(cmd: string, args: string[], cwd: string): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    cp.execFile(cmd, args, { cwd, timeout: 120_000, windowsHide: true }, (err, stdout, stderr) => {
      const output = `${stdout || ""}${stderr || ""}`.trim();
      resolve({ ok: !err, output });
    });
  });
}

function workspaceRootOf(f: Finding): string | undefined {
  if (f.workspaceRoot) {
    return f.workspaceRoot;
  }
  const dir = path.dirname(f.path);
  return dir || undefined;
}

export async function uninstallMaliciousFinding(finding: Finding): Promise<boolean> {
  if (!isMaliciousFinding(finding) || !finding.packageName) {
    void vscode.window.showWarningMessage("Only malicious packages can be uninstalled from this view.");
    return false;
  }
  const root = workspaceRootOf(finding);
  const label = uninstallConfirmLabel(finding);
  const choice = await vscode.window.showWarningMessage(
    `Uninstall ${label}? This removes it from the manifest. It does not run npm/pip install.`,
    { modal: true },
    "Uninstall",
  );
  if (choice !== "Uninstall") {
    return false;
  }

  try {
    if (finding.surface === "mcp") {
      const raw = fs.readFileSync(finding.path, "utf8");
      const { next, removed } = removeMcpServerByPackage(raw, finding.packageName);
      if (removed.length === 0) {
        void vscode.window.showWarningMessage(`Could not find an MCP server for ${finding.packageName}.`);
        return false;
      }
      fs.writeFileSync(finding.path, next, "utf8");
      void vscode.window.showInformationMessage(`Removed MCP server(s): ${removed.join(", ")}.`);
      return true;
    }

    if (finding.ecosystem === "pypi") {
      if (root) {
        await run(pipBin(), ["uninstall", "-y", finding.packageName], root);
      }
      if (path.basename(finding.path).toLowerCase() === "requirements.txt" && fs.existsSync(finding.path)) {
        const next = stripRequirementsLine(fs.readFileSync(finding.path, "utf8"), finding.packageName);
        fs.writeFileSync(finding.path, next, "utf8");
      }
      void vscode.window.showInformationMessage(`Removed ${finding.packageName} from requirements.`);
      return true;
    }

    if (finding.ecosystem === "npm") {
      const cwd = root || path.dirname(finding.path);
      const result = await run(npmBin(), ["uninstall", finding.packageName], cwd);
      if (!result.ok && path.basename(finding.path) === "package.json" && fs.existsSync(finding.path)) {
        const next = removePackageJsonDependency(fs.readFileSync(finding.path, "utf8"), finding.packageName);
        fs.writeFileSync(finding.path, next, "utf8");
      }
      void vscode.window.showInformationMessage(`Uninstalled ${finding.packageName} (npm).`);
      return true;
    }

    void vscode.window.showWarningMessage("Unsupported ecosystem for uninstall.");
    return false;
  } catch (err) {
    void vscode.window.showErrorMessage(`Uninstall failed: ${String(err)}`);
    return false;
  }
}
