import * as assert from "assert";
import { queryOsvQuerybatch } from "../api/osvClient";
import type { OsvQuery } from "../types";

suite("osvClient.queryOsvQuerybatch", () => {
  const queries: OsvQuery[] = [
    { ecosystem: "npm", name: "a", version: "1.0.0" },
    { ecosystem: "npm", name: "b", version: "2.0.0" },
  ];

  test("treats empty/missing results as degraded (ok=false)", async () => {
    const fetchImpl: typeof fetch = (async () => ({ ok: true, json: async () => ({ results: [] }) }) as unknown as Response) as any;
    const r = await queryOsvQuerybatch(queries, fetchImpl);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.results.length, queries.length);
  });

  test("treats short results as degraded (ok=false) and does not silently clean missing rows", async () => {
    const fetchImpl: typeof fetch = (async () =>
      ({
        ok: true,
        json: async () => ({ results: [{ vulns: [{ id: "MAL-2024-1" }] }] }),
      }) as unknown as Response) as any;
    const r = await queryOsvQuerybatch(queries, fetchImpl);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.results.length, queries.length);
    assert.ok((r.results[0] || []).some((v) => v.id === "MAL-2024-1"));
    assert.deepStrictEqual(r.results[1] || [], []);
  });
});

