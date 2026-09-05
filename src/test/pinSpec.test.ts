import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { analyzeItems } from "../scanners/itemAnalyzer";
import { inventoryWorkspaceRoot } from "../scanners/inventory";
import { isExactNpmSpec } from "../scanners/pinSpec";
import { buildPosture, EMPTY_INVENTORY_SUMMARY, notExactCoverageFindings } from "../ui/postureModel";

suite("pinSpec honesty", () => {
  test("isExactNpmSpec rejects ranges and tags", () => {
    assert.strictEqual(isExactNpmSpec("4.17.21"), true);
    assert.strictEqual(isExactNpmSpec("1.0.0-beta.1"), true);
    assert.strictEqual(isExactNpmSpec("^4.17.21"), false);
    assert.strictEqual(isExactNpmSpec("~1.2.3"), false);
    assert.strictEqual(isExactNpmSpec(">=1.0.0"), false);
    assert.strictEqual(isExactNpmSpec("latest"), false);
    assert.strictEqual(isExactNpmSpec("*"), false);
    assert.strictEqual(isExactNpmSpec("file:../lib"), false);
    assert.strictEqual(isExactNpmSpec("github:foo/bar"), false);
  });

  test("caret in package.json is not sent to OSV as a floor version", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "inv-range-"));
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ dependencies: { lodash: "^4.17.21", leftpad: "1.3.0" } }),
      "utf8",
    );
    const items = inventoryWorkspaceRoot(root);
    const lodash = items.find((i) => i.packageName === "lodash");
    const left = items.find((i) => i.packageName === "leftpad");
    assert.ok(lodash);
    assert.strictEqual(lodash!.version, "unknown");
    assert.strictEqual(lodash!.pinExact, false);
    assert.strictEqual(lodash!.spec, "^4.17.21");
    assert.strictEqual(left!.version, "1.3.0");
    assert.strictEqual(left!.pinExact, true);

    let osvCalled = false;
    const findings = await analyzeItems(items, "baseline", async (url, init) => {
      if (String(url).includes("querybatch")) {
        osvCalled = true;
        const body = JSON.parse(String(init?.body)) as { queries: Array<{ package: { name: string }; version?: string }> };
        assert.ok(!body.queries.some((q) => q.package.name === "lodash"));
        assert.ok(body.queries.some((q) => q.package.name === "leftpad" && q.version === "1.3.0"));
      }
      return { ok: true, json: async () => ({ results: [{}] }) } as Response;
    });
    assert.strictEqual(osvCalled, true);
    const notExact = findings.filter((f) => f.coverageKind === "not-exact");
    assert.ok(notExact.some((f) => f.packageName === "lodash"));
    assert.ok(!findings.some((f) => f.packageName === "lodash" && f.malicious));
    const model = buildPosture(findings, { ...EMPTY_INVENTORY_SUMMARY, hasOpenFolder: true, npmPins: 2 });
    const row = model.groups.find((g) => g.kind === "coverage")?.rows.find((r) => r.id === "notExact");
    assert.ok(row);
    assert.ok(notExactCoverageFindings(findings).length >= 1);
  });

  test("pypi range line is not treated as == pin", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "inv-pypi-range-"));
    fs.writeFileSync(path.join(root, "requirements.txt"), "requests>=2.31.0\nboto4==1.0.2\n", "utf8");
    const items = inventoryWorkspaceRoot(root);
    const req = items.find((i) => i.packageName === "requests");
    const boto = items.find((i) => i.packageName === "boto4");
    assert.strictEqual(req?.version, "unknown");
    assert.strictEqual(req?.pinExact, false);
    assert.strictEqual(boto?.version, "1.0.2");
    assert.strictEqual(boto?.pinExact, true);
  });
});
