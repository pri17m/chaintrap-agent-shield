import * as assert from "assert";
import type { Finding, InventoryItem } from "../types";
import { statusBarText } from "../ui/findingCopy";
import {
  actionableCoverageGapCount,
  buildPosture,
  EMPTY_INVENTORY_SUMMARY,
  lastFixHistoryRow,
  summarizeInventory,
  workspaceMcpSourceLabel,
} from "../ui/postureModel";

function finding(partial: Partial<Finding> & Pick<Finding, "id">): Finding {
  return {
    source: "baseline",
    surface: "package",
    severity: "info",
    title: "finding",
    message: "msg",
    path: "/repo/package.json",
    acknowledged: false,
    createdAt: "2026-09-04T00:00:00.000Z",
    ...partial,
  };
}

const checkedSummary = {
  ...EMPTY_INVENTORY_SUMMARY,
  hasOpenFolder: true,
  npmPins: 4,
  pypiPins: 1,
  mcpServers: 2,
};

suite("postureModel", () => {
  test("no open folder and empty inventory is a placeholder", () => {
    const model = buildPosture([], EMPTY_INVENTORY_SUMMARY);
    assert.strictEqual(model.placeholder, "No open folder");
    assert.strictEqual(model.groups.length, 0);
    assert.strictEqual(model.statusText, "Chaintrap: workspace clear");
  });

  test("open folder with nothing inventoried is a placeholder", () => {
    const model = buildPosture([], { ...EMPTY_INVENTORY_SUMMARY, hasOpenFolder: true });
    assert.strictEqual(model.placeholder, "Nothing inventoried yet");
    assert.strictEqual(model.statusText, "Chaintrap: workspace clear");
  });

  test("scanning with no inventory is a placeholder", () => {
    const model = buildPosture([], { ...EMPTY_INVENTORY_SUMMARY, scanning: true });
    assert.strictEqual(model.placeholder, "Scan in progress…");
    assert.strictEqual(model.statusText, "Chaintrap: scanning workspace…");
    assert.strictEqual(model.groups.length, 0);
  });

  test("scanning with inventory keeps dashboard counts", () => {
    const malicious = finding({
      id: "m",
      surface: "package",
      packageName: "evil",
      version: "1.0.0",
      severity: "critical",
      malicious: true,
      title: "This npm package is malicious",
    });
    const model = buildPosture([malicious], { ...checkedSummary, scanning: true });
    assert.strictEqual(model.placeholder, undefined);
    assert.strictEqual(model.statusText, "Chaintrap: scanning workspace…");
    assert.ok(model.groups.find((g) => g.kind === "attention")?.rows.some((r) => r.id === "maliciousPackages"));
  });

  test("checked section records last fix and last cleared", () => {
    assert.strictEqual(lastFixHistoryRow(checkedSummary).label, "Not yet cleared of malware/CVE");
    const fixed = lastFixHistoryRow({ ...checkedSummary, lastFixAt: "2026-09-05T08:00:00.000Z" });
    assert.match(fixed.label, /^Last Fix issues · /);
    const cleared = lastFixHistoryRow({
      ...checkedSummary,
      lastFixAt: "2026-09-05T08:00:00.000Z",
      lastClearedAt: "2026-09-05T08:01:00.000Z",
    });
    assert.match(cleared.label, /^Cleared of malware\/CVE · /);
    const model = buildPosture([], { ...checkedSummary, lastFixAt: "2026-09-05T08:00:00.000Z" });
    const row = model.groups.find((g) => g.kind === "checked")?.rows.find((r) => r.id === "lastFix");
    assert.ok(row);
    assert.match(row!.label, /^Last Fix issues · /);
  });

  test("malicious status beats unacked high", () => {
    const findings: Finding[] = [
      finding({
        id: "m",
        packageName: "evil",
        version: "1.0.0",
        severity: "critical",
        malicious: true,
        title: "This npm package is malicious",
      }),
      finding({
        id: "h",
        packageName: "lodash",
        version: "4.17.21",
        severity: "high",
        malicious: false,
        title: "This npm package is vulnerable",
      }),
    ];
    const model = buildPosture(findings, checkedSummary);
    assert.strictEqual(model.statusText, "Chaintrap: 1 malicious");
    const attention = model.groups.find((g) => g.kind === "attention");
    assert.ok(attention?.expanded);
    assert.ok(attention?.rows.some((r) => r.id === "maliciousPackages"));
    assert.ok(attention?.rows.some((r) => r.id === "vulnerable"));
    assert.ok(attention?.rows.some((r) => r.id === "unacked"));
    assert.strictEqual(attention?.rows.find((r) => r.id === "maliciousPackages")?.command?.command, "chaintrap.activity.focus");
  });

  test("acked malicious still drives malicious status", () => {
    const findings: Finding[] = [
      finding({
        id: "m",
        packageName: "evil",
        version: "1.0.0",
        severity: "critical",
        malicious: true,
        acknowledged: true,
        title: "This npm package is malicious",
      }),
    ];
    assert.strictEqual(buildPosture(findings, checkedSummary).statusText, "Chaintrap: 1 malicious");
    assert.strictEqual(buildPosture(findings, checkedSummary).attentionBadge, 0);
  });

  test("unacked high without malicious uses high status", () => {
    const high = finding({
      id: "h",
      packageName: "lodash",
      version: "4.17.21",
      severity: "high",
      malicious: false,
      title: "This npm package is vulnerable",
    });
    assert.match(statusBarText([high], checkedSummary), /high/);
  });

  test("coverage gaps when no attention", () => {
    const findings: Finding[] = [
      finding({
        id: "c",
        coverageNote: true,
        title: "Only direct pins are checked",
        message: "Add a lockfile",
      }),
      finding({
        id: "u",
        surface: "mcp",
        packageName: "foo",
        version: "unknown",
        mcpId: "foo",
        unverifiedOnline: true,
        title: "Unpinned npm package foo",
      }),
      finding({
        id: "o",
        packageName: "bar",
        version: "1.0.0",
        unverifiedOnline: true,
        title: "Could not verify bar",
      }),
    ];
    const model = buildPosture(findings, checkedSummary);
    assert.strictEqual(actionableCoverageGapCount(findings), 3);
    assert.strictEqual(model.statusText, "Chaintrap: 3 coverage gaps");
    const coverage = model.groups.find((g) => g.kind === "coverage");
    assert.ok(coverage?.rows.some((r) => r.id === "noLockfile"));
    assert.ok(coverage?.rows.some((r) => r.id === "unpinnedMcp"));
    assert.strictEqual(
      coverage?.rows.find((r) => r.id === "unpinnedMcp")?.command?.command,
      "chaintrap.pinMcpServerVersion",
    );
    assert.ok(coverage?.rows.some((r) => r.id === "unverified"));
    assert.ok(!coverage?.rows.some((r) => r.id === "skillsNotAnalyzed"));
  });

  test("unpinned MCP is not also counted as unverified", () => {
    const unpinned = finding({
      id: "u",
      surface: "mcp",
      packageName: "foo",
      version: "unknown",
      mcpId: "foo",
      unverifiedOnline: true,
      title: "Unpinned npm package foo",
    });
    assert.strictEqual(actionableCoverageGapCount([unpinned]), 1);
    const model = buildPosture([unpinned], checkedSummary);
    const coverage = model.groups.find((g) => g.kind === "coverage")!;
    assert.ok(coverage.rows.some((r) => r.id === "unpinnedMcp"));
    assert.ok(!coverage.rows.some((r) => r.id === "unverified"));
  });

  test("skills/rules inventoried are shown but not status-bar gaps", () => {
    const summary = { ...checkedSummary, skills: 3, rules: 2 };
    const model = buildPosture([], summary);
    assert.strictEqual(model.statusText, "Chaintrap: 7 packages checked");
    const coverage = model.groups.find((g) => g.kind === "coverage");
    assert.ok(coverage?.rows.some((r) => r.id === "skillsNotAnalyzed" && r.count === 5));
    assert.strictEqual(
      coverage?.rows.find((r) => r.id === "skillsNotAnalyzed")?.command?.command,
      "chaintrap.explainCoverageGap",
    );
    assert.strictEqual(actionableCoverageGapCount([]), 0);
  });

  test("idle with pins is packages checked, never ready", () => {
    const model = buildPosture([], checkedSummary);
    assert.strictEqual(model.statusText, "Chaintrap: 7 packages checked");
    assert.ok(!model.statusText.includes("ready"));
    const checked = model.groups.find((g) => g.kind === "checked");
    assert.ok(checked?.rows.some((r) => r.id === "checkedNpm" && r.label.includes("4")));
    assert.ok(checked?.rows.some((r) => r.id === "checkedPypi"));
    assert.ok(checked?.rows.some((r) => r.id === "checkedMcp"));
  });

  test("single package uses singular status copy", () => {
    const model = buildPosture([], { ...EMPTY_INVENTORY_SUMMARY, hasOpenFolder: true, npmPins: 1 });
    assert.strictEqual(model.statusText, "Chaintrap: 1 package checked");
  });

  test("workspace MCP source labels vscode and cursor", () => {
    assert.strictEqual(workspaceMcpSourceLabel(["vscode"]), "Workspace MCP: .vscode/mcp.json");
    assert.strictEqual(workspaceMcpSourceLabel(["vscode", "cursor"]), "Workspace MCP: .vscode/mcp.json, .cursor/mcp.json");
    const model = buildPosture([], { ...checkedSummary, workspaceMcpSources: ["vscode"] });
    const checked = model.groups.find((g) => g.kind === "checked");
    assert.ok(checked?.rows.some((r) => r.id === "mcpSources" && r.label.includes(".vscode/mcp.json")));
  });

  test("malicious MCP row focuses MCP view", () => {
    const f = finding({
      id: "m",
      surface: "mcp",
      packageName: "evil",
      version: "1.0.0",
      mcpId: "bad",
      severity: "critical",
      malicious: true,
      title: "This npm package is malicious",
    });
    const model = buildPosture([f], checkedSummary);
    const row = model.groups.find((g) => g.kind === "attention")?.rows.find((r) => r.id === "maliciousMcp");
    assert.strictEqual(row?.command?.command, "chaintrap.mcp.focus");
  });

  test("summarizeInventory counts kinds and MCP path sources", () => {
    const items: InventoryItem[] = [
      { key: "a", kind: "package", path: "/r/package.json", hash: "1", ecosystem: "npm", packageName: "a", version: "1.0.0" },
      { key: "b", kind: "package", path: "/r/requirements.txt", hash: "2", ecosystem: "pypi", packageName: "b", version: "1.0.0" },
      {
        key: "c",
        kind: "mcp",
        path: "/r/.vscode/mcp.json",
        hash: "3",
        workspaceRoot: "/r",
        mcpId: "vs",
        packageName: "x",
      },
      {
        key: "d",
        kind: "mcp",
        path: "/r/.cursor/mcp.json",
        hash: "4",
        workspaceRoot: "/r",
        mcpId: "cu",
        packageName: "y",
      },
      { key: "e", kind: "skill", path: "/r/.cursor/skills/s/SKILL.md", hash: "5", workspaceRoot: "/r" },
      { key: "f", kind: "rule", path: "/r/AGENTS.md", hash: "6", workspaceRoot: "/r" },
    ];
    const summary = summarizeInventory(items, true);
    assert.strictEqual(summary.npmPins, 1);
    assert.strictEqual(summary.pypiPins, 1);
    assert.strictEqual(summary.mcpServers, 2);
    assert.strictEqual(summary.skills, 1);
    assert.strictEqual(summary.rules, 1);
    assert.deepStrictEqual(summary.workspaceMcpSources, ["vscode", "cursor"]);
    assert.strictEqual(summary.hasOpenFolder, true);
    assert.strictEqual(summary.scanning, false);
  });

  test("tooltip lists malicious vulnerable gaps checked", () => {
    const model = buildPosture([], checkedSummary);
    assert.strictEqual(model.statusTooltip, "malicious 0 · vulnerable 0 · gaps 0 · 7 checked");
  });

  test("denylist unavailable shows explicit status and a coverage row", () => {
    const deny = finding({
      id: "baseline:extension:denylistUnavailable",
      surface: "extension",
      severity: "info",
      title: "Denylist unavailable",
      message: "Known-bad denylist could not be loaded",
    });
    const model = buildPosture([deny], checkedSummary);
    assert.strictEqual(model.statusText, "Chaintrap: denylist unavailable");
    const coverage = model.groups.find((g) => g.kind === "coverage");
    assert.ok(coverage?.rows.some((r) => r.id === "denylistUnavailable"));
  });
});
