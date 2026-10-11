import * as assert from "assert";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Finding } from "../types";

const CLI = join(__dirname, "..", "runtime", "mcpProxyCli.js");

const MOCK = `
const fs=require('fs');
require('readline').createInterface({input:process.stdin}).on('line',l=>{
  fs.appendFileSync(process.env.MOCK_LOG,l+'\\n');
  let m;try{m=JSON.parse(l)}catch{return}
  if(m&&m.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{ok:true}})+'\\n');
});`;

function run(env: Record<string, string>, lines: string[], closeStdin: boolean) {
  const dir = mkdtempSync(join(tmpdir(), "ct-proxy-"));
  const mock = join(dir, "mock.js");
  const log = join(dir, "mock.log");
  const fx = join(dir, "findings.json");
  writeFileSync(mock, MOCK);
  writeFileSync(log, "");
  const evil: Partial<Finding> = {
    id: "m", source: "baseline", surface: "mcp", severity: "critical", title: "mal", message: "",
    path: "p", acknowledged: false, createdAt: "", malicious: true, packageName: "evil-mcp",
  };
  writeFileSync(fx, JSON.stringify([evil]));
  return new Promise<{ code: number | null; out: string; err: string; child: string }>((resolve, reject) => {
    const p = spawn(process.execPath, [CLI, process.execPath, mock], {
      env: { ...process.env, MOCK_LOG: log, CHAINTRAP_FINDINGS_PATH: fx, ...env },
    });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => {
      p.kill();
      reject(new Error("proxy did not exit"));
    }, 8000);
    p.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out, err, child: readFileSync(log, "utf8") });
    });
    for (const l of lines) {
      p.stdin.write(l + "\n");
    }
    if (closeStdin) {
      p.stdin.end();
    }
  });
}

const call = (id: number) => JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "x" } });

suite("mcpProxyCli (process level)", () => {
  test("blocked call is answered with an error and never reaches the child; proxy exits when stdin closes", async () => {
    const r = await run({ CHAINTRAP_PACKAGE_NAME: "evil-mcp" }, [call(1)], true);
    assert.strictEqual(r.code, 0);
    assert.ok(JSON.parse(r.out.trim()).error);
    assert.strictEqual(r.child, "");
  });

  test("allowed call is forwarded and the child's response returned", async () => {
    const r = await run({ CHAINTRAP_PACKAGE_NAME: "other" }, [call(2)], true);
    assert.strictEqual(r.code, 0);
    assert.strictEqual(JSON.parse(r.out.trim()).result.ok, true);
    assert.ok(r.child.includes('"id":2'));
  });

  test("batch containing a blocked call is rejected and not forwarded", async () => {
    const r = await run({ CHAINTRAP_PACKAGE_NAME: "evil-mcp" }, [`[${call(3)},${call(4)}]`], true);
    const resp = JSON.parse(r.out.trim()) as Array<{ id: number; error: unknown }>;
    assert.deepStrictEqual(resp.map((e) => e.id), [3, 4]);
    assert.ok(resp.every((e) => e.error));
    assert.strictEqual(r.child, "");
  });

  test("a null JSON line does not crash the proxy", async () => {
    const r = await run({ CHAINTRAP_PACKAGE_NAME: "evil-mcp" }, ["null", call(5)], true);
    assert.strictEqual(r.code, 0);
    assert.ok(r.out.includes('"error"'));
  });

  test("missing findings file fails open and says so on stderr", async () => {
    const r = await run({ CHAINTRAP_PACKAGE_NAME: "evil-mcp", CHAINTRAP_FINDINGS_PATH: "/nonexistent/f.json" }, [call(6)], true);
    assert.ok(r.child.includes('"id":6'));
    assert.ok(/could not load findings/.test(r.err));
  });
});
