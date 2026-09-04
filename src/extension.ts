import * as vscode from "vscode";
import { ChaintrapClient } from "./api/chaintrapClient";
import { ApiKeyStore } from "./store/apiKeyStore";
import { StateStore } from "./store/stateStore";
import { openFindingLocation } from "./ui/ackFlow";
import { AgentActivityProvider, FindingItem } from "./ui/agentActivityTree";
import { ShieldController } from "./ui/controller";
import { needsAckPopup } from "./ui/findingCopy";
import { uninstallMaliciousFinding } from "./ui/uninstallFlow";
import { ProblemsReporter } from "./ui/problems";
import { createWatchers } from "./watchers/fileWatchers";

export function activate(context: vscode.ExtensionContext): void {
  const store = new StateStore(context);
  store.sessionStartedAt();
  const apiKeys = new ApiKeyStore(context.secrets);
  const diagnostics = vscode.languages.createDiagnosticCollection("chaintrap");
  const problems = new ProblemsReporter(diagnostics);
  const tree = new AgentActivityProvider();
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 80);
  status.command = "chaintrap.reviewDelta";
  status.text = "Chaintrap: starting";
  status.show();

  const treeView = vscode.window.createTreeView("chaintrap.activity", {
    treeDataProvider: tree,
    showCollapseAll: true,
  });
  const controller = new ShieldController(store, problems, tree, status, treeView);
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
  const watchers = createWatchers(() => controller.scheduleDelta(folders()));

  context.subscriptions.push(
    diagnostics,
    status,
    treeView,
    watchers,
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void controller.runBaseline(folders());
    }),
    vscode.commands.registerCommand("chaintrap.openFindingLocation", async (filePath: string) => {
      if (typeof filePath === "string" && filePath) {
        await openFindingLocation(filePath);
      }
    }),
    vscode.commands.registerCommand("chaintrap.rescanBaseline", () => controller.runBaseline(folders())),
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
        await store.acknowledge(picked.finding.id);
        controller.refreshUi(folders());
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
        void vscode.window.showInformationMessage("Right-click a malicious package in the Chaintrap view.");
        return;
      }
      const ok = await uninstallMaliciousFinding(finding);
      if (ok) {
        await controller.runBaseline(folders());
      }
    }),
    vscode.commands.registerCommand("chaintrap.scanInstalledExtensions", async () => {
      const cfg = vscode.workspace.getConfiguration("chaintrap");
      const apiKey = await apiKeys.get();
      const apiBase = String(cfg.get("apiBase") || "https://scan.chaintrap.com");
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
      const exts = vscode.extensions.all.filter((e) => !e.id.startsWith("vscode."));
      const picked = await vscode.window.showQuickPick(
        exts.map((e) => ({ label: e.id, description: e.packageJSON?.version ? String(e.packageJSON.version) : "" })),
      );
      if (!picked) {
        return;
      }
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
            await vscode.env.openExternal(vscode.Uri.parse(url.startsWith("http") ? url : `${apiBase}${url}`));
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
