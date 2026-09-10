import * as assert from "assert";
import { acknowledgeFindingWithPanel } from "../ui/ackCommand";
import type { Finding } from "../types";

function f(partial: Partial<Finding> & Pick<Finding, "id">): Finding {
  return {
    source: "baseline",
    surface: "package",
    severity: "high",
    title: "finding",
    message: "msg",
    path: "/repo/package.json",
    acknowledged: false,
    createdAt: "2026-09-05T00:00:00.000Z",
    ...partial,
  };
}

suite("ackCommand", () => {
  test("does not acknowledge when panel is dismissed", async () => {
    let acked = false;
    const ok = await acknowledgeFindingWithPanel({
      finding: f({ id: "x" }),
      prompt: async () => "dismiss",
      acknowledge: async () => {
        acked = true;
      },
    });
    assert.strictEqual(ok, false);
    assert.strictEqual(acked, false);
  });

  test("acknowledges only after explicit panel ack", async () => {
    const calls: string[] = [];
    const ok = await acknowledgeFindingWithPanel({
      finding: f({ id: "y" }),
      prompt: async () => {
        calls.push("prompt");
        return "ack";
      },
      acknowledge: async (id) => {
        calls.push(`ack:${id}`);
      },
    });
    assert.strictEqual(ok, true);
    assert.deepStrictEqual(calls, ["prompt", "ack:y"]);
  });
});

