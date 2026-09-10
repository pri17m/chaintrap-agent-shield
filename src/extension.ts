import * as vscode from "vscode";
import { ChaintrapClient } from "./api/chaintrapClient";
import { ApiKeyStore } from "./store/apiKeyStore";
import { StateStore } from "./store/stateStore";
import { openFindingLocation } from "./ui/ackFlow";
import { AgentActivityProvider, FindingItem } from "./ui/agentActivityTree";
import { ShieldController } from "./ui/controller";
import { needsAckPopup } from "./ui/findingCopy";
import { PostureProvider } from "./ui/postureTree";
import { groupMcpFindings } from "./ui/findingGroups";
import { runFixIssues } from "./ui/fixIssuesFlow";
import { pinMcpFinding } from "./ui/pinFlow";
import { uninstallMaliciousFinding } from "./ui/uninstallFlow";
import { ProblemsReporter } from "./ui/problems";
import { createWatchers } from "./watchers/fileWatchers";
import { normalizeApiBase, resolveExternalHttpUrl } from "./api/urlSafety";
import { promptFindingInPanel } from "./ui/ackWebview";
import { acknowledgeFindingWithPanel } from "./ui/ackCommand";

export function activate(context: vscode.ExtensionContext): void {
  const store = new StateStore(context);
  store.sessionStartedAt();
  const apiKeys = new ApiKeyStore(context.secrets);
  const diagnostics = vscode.languages.createDiagnosticCollection("chaintrap");
  const problems = new ProblemsReporter(diagnostics);
  const depTree = new AgentActivityProvider("package");
  const mcpTree = new AgentActivityProvider("mcp");
  const postureTree = new PostureProvider();
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 80);
  status.command = "chaintrap.focusPosture";
  status.text = "Chaintrap: starting";
  status.show();

  const postureView = vscode.window.createTreeView("chaintrap.posture", {
    treeDataProvider: postureTree,
    showCollapseAll: true,
  });
  const depView = vscode.window.createTreeView("chaintrap.activity", {
    treeDataProvider: depTree,
    showCollapseAll: true,
  });
  const mcpView = vscode.window.createTreeView("chaintrap.mcp", {
    treeDataProvider: mcpTree,
    showCollapseAll: true,
  });
  const controller = new ShieldController(store, problems, [depTree, mcpTree], postureTree, status, [depView, mcpView], postureView);
  const folders = () => vscode.workspace.workspaceFolders || [];

  void (async () => {
    const cfg = vscode.workspace.getConfiguration("chaintrap");
    const plain = String(cfg.get("apiKey") || "");
    await apiKeys.migrateFromPlaintext(plain, async () => {
      try {
        await cfg.update("apiKey", "", vscode.ConfigurationTarget.Global);
      } catch {
        /* settings may be RO */
      }
    });
  })();

  void controller.runBaseline(folders());
  let watchers = createWatchers(() => controller.scheduleDelta(folders()), { includeHome: vscode.workspace.isTrusted });

  context.subscriptions.push(
    diagnostics,
    status,
    postureView,
    depView,
    mcpView,
    watchers,
    vscode.workspace.onDidGrantWorkspaceTrust(() => {
      // Start watching home config only after trust is granted.
      watchers.dispose();
      watchers = createWatchers(() => controller.scheduleDelta(folders()), { includeHome: true });
      context.subscriptions.push(watchers);
      void controller.runBaseline(folders());
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void controller.runBaseline(folders());
    }),
    vscode.commands.registerCommand("chaintrap.openFindingLocation", async (filePath: string) => {
      if (typeof filePath === "string" && filePath) {
        await openFindingLocation(filePath);
      }
    }),
    vscode.commands.registerCommand("chaintrap.rescanBaseline", () => controller.runBaseline(folders())),
    vscode.commands.registerCommand("chaintrap.focusPosture", async () => {
      await vscode.commands.executeCommand("workbench.view.extension.chaintrap");
      await vscode.commands.executeCommand("chaintrap.posture.focus");
    }),
    vscode.commands.registerCommand("chaintrap.reviewDelta", async () => {
      const delta = controller.deltaSinceSession();
      if (delta.length === 0) {
        void vscode.window.showInformationMessage("Chaintrap: no agent changes since this session started.");
        return;
      }
      const lines = delta.map((f) => `[${f.severity}] ${f.title}`).join("\n");
      await vscode.window.showInformationMessage(`Chaintrap delta findings (${delta.length})\n${lines}`, { modal: true });
    }),
    vscode.commands.registerCommand("chaintrap.acknowledgeFinding", async () => {
      const pending = store.getFindings().filter((f) => needsAckPopup(f));
      if (pending.length === 0) {
        void vscode.window.showInformationMessage("No unacknowledged high/critical findings.");
        return;
      }
      const picked = await vscode.window.showQuickPick(
        pending.map((f) => ({ label: `[${f.severity}] ${f.title}`, description: f.path, finding: f })),
      );
      if (picked) {
        const ok = await acknowledgeFindingWithPanel({
          finding: picked.finding,
          prompt: (f) => promptFindingInPanel(f, 1, 1),
          acknowledge: (id) => store.acknowledge(id),
        });
        if (ok) {
          controller.refreshUi(folders());
        }
      }
    }),
    vscode.commands.registerCommand("chaintrap.setApiKey", async () => {
      const value = await vscode.window.showInputBox({
        title: "Chaintrap API key",
        prompt: "Stored in VS Code SecretStorage (not settings.json)",
        password: true,
        ignoreFocusOut: true,
      });
      if (value === undefined) {
        return;
      }
      await apiKeys.set(value);
      void vscode.window.showInformationMessage(value.trim() ? "Chaintrap API key saved." : "Chaintrap API key cleared.");
    }),
    vscode.commands.registerCommand("chaintrap.clearApiKey", async () => {
      await apiKeys.clear();
      void vscode.window.showInformationMessage("Chaintrap API key cleared.");
    }),
    vscode.commands.registerCommand("chaintrap.uninstallMaliciousPackage", async (item?: FindingItem) => {
      const finding = item?.finding;
      if (!finding) {
        void vscode.window.showInformationMessage("Right-click a malicious item in Dependencies or MCP servers.");
        return;
      }
      const ok = await uninstallMaliciousFinding(finding);
      if (ok) {
        await store.recordFixApplied();
        await controller.dismissActionedFinding(finding, folders());
        await controller.runBaseline(folders());
      }
    }),
    vscode.commands.registerCommand("chaintrap.explainCoverageGap", async (kind?: string) => {
      if (kind === "skills") {
        void vscode.window.showInformationMessage(
          "Skills and rules are listed for coverage only. They are not scanned and cannot be pinned.",
        );
        return;
      }
      void vscode.window.showInformationMessage("Click a coverage row for the action that applies to that gap.");
    }),
    vscode.commands.registerCommand("chaintrap.pinMcpServerVersion", async (item?: FindingItem) => {
      let finding = item?.finding;
      if (!finding) {
        const unpinned = groupMcpFindings(store.getFindings()).unpinned.filter((f) => f.ecosystem === "npm");
        if (unpinned.length === 0) {
          void vscode.window.showInformationMessage(
            "No unpinned npm MCP servers to pin. uvx/Python servers stay as coverage gaps (npx-style args only).",
          );
          return;
        }
        if (unpinned.length === 1) {
          finding = unpinned[0];
        } else {
          const picked = await vscode.window.showQuickPick(
            unpinned.map((f) => ({
              label: f.mcpId || f.packageName || f.id,
              description: f.packageName,
              detail: f.path,
              finding: f,
            })),
            { title: "Pin which MCP server?", placeHolder: "Writes package@version into mcp.json" },
          );
          finding = picked?.finding;
        }
      }
      if (!finding) {
        return;
      }
      const ok = await pinMcpFinding(finding);
      if (ok) {
        await store.recordFixApplied();
        await controller.dismissActionedFinding(finding, folders());
        await controller.runBaseline(folders());
      }
    }),
    vscode.commands.registerCommand("chaintrap.fixIssues", async () => {
      const applied = await runFixIssues(store.getFindings());
      if (applied && applied.length > 0) {
        await store.recordFixApplied();
        await controller.dismissActionedFindings(applied, folders());
        await controller.runBaseline(folders());
      }
    }),
    vscode.commands.registerCommand("chaintrap.scanInstalledExtensions", async () => {
      const cfg = vscode.workspace.getConfiguration("chaintrap");
      const apiKey = await apiKeys.get();
      const inspected = cfg.inspect<string>("apiBase");
      const rawApiBase = String(inspected?.globalValue ?? inspected?.defaultValue ?? "https://scan.chaintrap.com");
      const hasWorkspaceOverride = inspected?.workspaceValue !== undefined || inspected?.workspaceFolderValue !== undefined;
      if (hasWorkspaceOverride) {
        void vscode.window.showWarningMessage(
          "Chaintrap: ignoring workspace-level chaintrap.apiBase for security. Set it in User settings instead.",
        );
      }
      const normalized = normalizeApiBase(rawApiBase);
      if (!apiKey) {
        void vscode.window.showWarningMessage(
          "No API key in SecretStorage. Run Chaintrap: Set API key.",
          "Set API key",
        ).then((c) => {
          if (c === "Set API key") {
            void vscode.commands.executeCommand("chaintrap.setApiKey");
          }
        });
        return;
      }
      if (!normalized.ok) {
        void vscode.window.showErrorMessage(
          `Chaintrap API base URL is invalid or unsafe (${normalized.error}). Use an https:// URL (or http://localhost for local testing).`,
        );
        return;
      }
      const exts = vscode.extensions.all.filter((e) => !e.id.startsWith("vscode."));
      const picked = await vscode.window.showQuickPick(
        exts.map((e) => ({ label: e.id, description: e.packageJSON?.version ? String(e.packageJSON.version) : "" })),
      );
      if (!picked) {
        return;
      }
      const apiBase = normalized.value;
      const client = new ChaintrapClient(apiBase, apiKey);
      try {
        const job = await client.analyzeExtension(picked.label, "vscode");
        const done = await client.pollJob(job.job_id);
        const url = done.report_url;
        if (url) {
          const open = await vscode.window.showInformationMessage(
            `Scan ${done.status} (${done.risk_level || "n/a"}).`,
            "Open report",
          );
          if (open === "Open report") {
            const resolved = resolveExternalHttpUrl(url, apiBase);
            if (!resolved) {
              void vscode.window.showWarningMessage("Chaintrap: report URL was invalid.");
              return;
            }
            await vscode.env.openExternal(vscode.Uri.parse(resolved));
          }
        } else {
          void vscode.window.showInformationMessage(`Scan ${done.status}: ${done.error_message || "no report URL"}`);
        }
      } catch (err) {
        void vscode.window.showErrorMessage(String(err));
      }
    }),
    vscode.extensions.onDidChange(async () => {
      const cfg = vscode.workspace.getConfiguration("chaintrap");
      if (!cfg.get("enableDeepExtensionScan") || !(await apiKeys.get())) {
        return;
      }
      void vscode.window.showInformationMessage(
        "A VS Code extension was installed or changed. Run Chaintrap: Deep-scan installed VS Code extensions.",
      );
    }),
  );
}

export function deactivate(): void {
  /* noop */
}
