import * as assert from "assert";

import { evaluateClientLine, payloadFromRpc } from "../runtime/mcpProxy";
import type { Finding } from "../types";

function malicious(): Finding {
  return {
    id: "m1",
    source: "baseline",
    surface: "mcp",
    severity: "critical",
    title: "Malicious",
    message: "",
    path: "/tmp/mcp.json",
    acknowledged: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    packageName: "evil-mcp",
    mcpId: "evil",
    malicious: true,
  };
}

suite("mcpProxy", () => {
  test("payloadFromRpc extracts tool name and args preview", () => {
    const p = payloadFromRpc(
      { method: "tools/call", params: { name: "run", arguments: { q: "x" } } },
      { serverId: "evil", packageName: "evil-mcp" },
    );
    assert.strictEqual(p.toolName, "run");
    assert.strictEqual(p.serverId, "evil");
    assert.ok(p.argumentsPreview?.includes("q"));
  });

  test("blocks tools/call when pin is malicious", () => {
    const line = JSON.stringify({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "run", arguments: {} },
    });
    const decided = evaluateClientLine(line, [malicious()], { packageName: "evil-mcp" });
    assert.strictEqual(decided.forward, false);
    assert.ok(decided.response);
    const err = JSON.parse(decided.response!) as { error: { message: string }; id: number };
    assert.strictEqual(err.id, 7);
    assert.ok(err.error.message.includes("blocked"));
  });

  test("forwards non-tools/call methods", () => {
    const line = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const decided = evaluateClientLine(line, [malicious()], { packageName: "evil-mcp" });
    assert.strictEqual(decided.forward, true);
  });

  test("forwards tools/call when not malicious", () => {
    const line = JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "list" },
    });
    const decided = evaluateClientLine(line, [], { packageName: "safe" });
    assert.strictEqual(decided.forward, true);
  });
});
