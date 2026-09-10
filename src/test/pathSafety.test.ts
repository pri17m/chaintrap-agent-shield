import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { safeExistingFilePath } from "../security/pathSafety";

suite("pathSafety.safeExistingFilePath", () => {
  test("allows a regular file inside allowedRoots", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "chaintrap-path-"));
    const root = path.join(tmp, "root");
    fs.mkdirSync(root, { recursive: true });
    const p = path.join(root, "package.json");
    fs.writeFileSync(p, '{"name":"x"}\n', "utf8");
    const r = safeExistingFilePath(p, { allowedRoots: [root] });
    assert.deepStrictEqual(r.ok, true);
  });

  test("rejects symlink paths (no-follow)", function () {
    if (process.platform === "win32") {
      this.skip();
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "chaintrap-path-"));
    const root = path.join(tmp, "root");
    const outside = path.join(tmp, "outside");
    fs.mkdirSync(root, { recursive: true });
    fs.mkdirSync(outside, { recursive: true });
    const secret = path.join(outside, "secret.txt");
    fs.writeFileSync(secret, "secret\n", "utf8");
    const link = path.join(root, "package.json");
    fs.symlinkSync(secret, link);
    const r = safeExistingFilePath(link, { allowedRoots: [root] });
    assert.deepStrictEqual(r, { ok: false, reason: "symlink" });
  });

  test("rejects files outside allowedRoots unless explicitly allowlisted", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "chaintrap-path-"));
    const root = path.join(tmp, "root");
    const outside = path.join(tmp, "outside");
    fs.mkdirSync(root, { recursive: true });
    fs.mkdirSync(outside, { recursive: true });
    const p = path.join(outside, "mcp.json");
    fs.writeFileSync(p, "{}\n", "utf8");
    const r1 = safeExistingFilePath(p, { allowedRoots: [root] });
    assert.deepStrictEqual(r1.ok, false);
    const r2 = safeExistingFilePath(p, { allowedRoots: [root], allowedExactFiles: [p] });
    assert.deepStrictEqual(r2.ok, true);
  });
});

