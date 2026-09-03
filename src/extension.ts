import * as vscode from "vscode";
import { ChaintrapClient } from "./api/chaintrapClient";
import { StateStore } from "./store/stateStore";
import { AgentActivityProvider } from "./ui/agentActivityTree";
import { ShieldController } from "./ui/controller";
import { ProblemsReporter } from "./ui/problems";
import { createWatchers } from "./watchers/fileWatchers";

export function activate(context: vscode.ExtensionContext): void {
  const store = new StateStore(context);
  store.sessionStartedAt();
  const diagnostics = vscode.languages.createDiagnosticCollection("chaintrap");
  const problems = new ProblemsReporter(diagnostics);
  const tree = new AgentActivityProvider();
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 80);
  status.command = "chaintrap.reviewDelta";
  status.text = "Chaintrap: starting";
  status.show();

  const controller = new ShieldController(store, problems, tree, status);
  const treeView = vscode.window.registerTreeDataProvider("chaintrap.activity", tree);

  const folders = () => vscode.workspace.workspaceFolders || [];

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
      const pending = store.getFindings().filter((f) => f.severity === "critical" && !f.acknowledged);
      if (pending.length === 0) {
        void vscode.window.showInformationMessage("No unacknowledged critical findings.");
        return;
      }
      const picked = await vscode.window.showQuickPick(
        pending.map((f) => ({ label: f.title, description: f.path, finding: f })),
      );
      if (picked) {
        await store.acknowledge(picked.finding.id);
        problems.refresh(store.getFindings());
        tree.refresh(store.getFindings());
      }
    }),
    vscode.commands.registerCommand("chaintrap.installGuard", () => {
      void vscode.env.openExternal(
        vscode.Uri.parse("https://github.com/pri17m/extension-analyser/blob/main/docs/CHAINTRAP_GUARD.md"),
      );
    }),
    vscode.commands.registerCommand("chaintrap.scanInstalledExtensions", async () => {
      const cfg = vscode.workspace.getConfiguration("chaintrap");
      const apiKey = String(cfg.get("apiKey") || "");
      const apiBase = String(cfg.get("apiBase") || "https://scan.chaintrap.com");
      if (!apiKey) {
        void vscode.window.showWarningMessage("Set chaintrap.apiKey to run deep VS Code extension scans.");
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
    vscode.extensions.onDidChange(() => {
      const cfg = vscode.workspace.getConfiguration("chaintrap");
      if (!cfg.get("enableDeepExtensionScan") || !cfg.get("apiKey")) {
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
