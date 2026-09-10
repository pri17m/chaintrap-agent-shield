import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { clearKnownBadCache, knownBadHealth, loadKnownBad } from "../scanners/knownBad";

suite("knownBad loader health", () => {
  test("reports degraded when JSON is missing/corrupt (no silent ok)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-bad-"));
    const p = path.join(dir, "known_bad_packages.json");
    fs.writeFileSync(p, "{not-json", "utf8");
    clearKnownBadCache();
    loadKnownBad(p);
    const h = knownBadHealth(p);
    assert.strictEqual(h.ok, false);
    assert.strictEqual(h.path, p);
    assert.ok(h.error);
  });

  test("reports ok when JSON is parseable", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-ok-"));
    const p = path.join(dir, "known_bad_packages.json");
    fs.writeFileSync(p, JSON.stringify({ version: 1, updated: "2026-09-10", npm: {}, pypi: {}, references: {} }), "utf8");
    clearKnownBadCache();
    loadKnownBad(p);
    const h = knownBadHealth(p);
    assert.strictEqual(h.ok, true);
    assert.strictEqual(h.updated, "2026-09-10");
  });
});

