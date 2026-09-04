import * as assert from "assert";
import { normalizeApiBase, resolveExternalHttpUrl } from "../api/urlSafety";

suite("urlSafety", () => {
  test("normalizeApiBase allows https and strips trailing slash", () => {
    const r = normalizeApiBase("https://scan.chaintrap.com/");
    assert.deepStrictEqual(r, { ok: true, value: "https://scan.chaintrap.com" });
  });

  test("normalizeApiBase rejects non-http(s) schemes", () => {
    const r = normalizeApiBase("javascript:alert(1)");
    assert.deepStrictEqual(r, { ok: false, error: "unsupported_protocol" });
  });

  test("normalizeApiBase rejects http except loopback", () => {
    const r = normalizeApiBase("http://example.com");
    assert.deepStrictEqual(r, { ok: false, error: "http_not_allowed" });
  });

  test("normalizeApiBase allows http localhost for local testing", () => {
    const r = normalizeApiBase("http://localhost:7777/");
    assert.deepStrictEqual(r, { ok: true, value: "http://localhost:7777" });
  });

  test("resolveExternalHttpUrl resolves relative URLs against apiBase", () => {
    const resolved = resolveExternalHttpUrl("/report/123", "https://scan.chaintrap.com");
    assert.strictEqual(resolved, "https://scan.chaintrap.com/report/123");
  });

  test("resolveExternalHttpUrl rejects non-http(s) report URLs", () => {
    const resolved = resolveExternalHttpUrl("file:///etc/passwd", "https://scan.chaintrap.com");
    assert.strictEqual(resolved, undefined);
  });
});

