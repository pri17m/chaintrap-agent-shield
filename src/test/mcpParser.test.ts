import * as assert from "assert";
import { inferNpmPypiFromMcpRow, parseMcpConfigJson } from "../scanners/mcpParser";

suite("mcpParser", () => {
  test("infers scoped npm from npx -y", () => {
    const inf = inferNpmPypiFromMcpRow({
      Command: "npx",
      Args: ["-y", "@scope/w@2.0.0"],
    });
    assert.deepStrictEqual(inf, { ecosystem: "npm", name: "@scope/w", version: "2.0.0" });
  });

  test("infers npm when command empty and args are -y scoped", () => {
    const inf = inferNpmPypiFromMcpRow({
      Command: "",
      Args: ["-y", "@google-cloud/cloud-run-mcp@1.10.0"],
    });
    assert.deepStrictEqual(inf, {
      ecosystem: "npm",
      name: "@google-cloud/cloud-run-mcp",
      version: "1.10.0",
    });
  });

  test("parses args JSON string", () => {
    const inf = inferNpmPypiFromMcpRow({
      Command: "npx",
      Args: '["-y", "@scope/w@2.0.0"]',
    });
    assert.deepStrictEqual(inf, { ecosystem: "npm", name: "@scope/w", version: "2.0.0" });
  });

  test("infers pypi from python -m", () => {
    const inf = inferNpmPypiFromMcpRow({
      command: "python",
      args: ["-m", "code_review_graph", "serve"],
    });
    assert.deepStrictEqual(inf, { ecosystem: "pypi", name: "code-review-graph", version: "unknown" });
  });

  test("infers pypi from -m without python in command", () => {
    const inf = inferNpmPypiFromMcpRow({ Command: "", Args: ["-m", "code_review_graph", "serve"] });
    assert.deepStrictEqual(inf, { ecosystem: "pypi", name: "code-review-graph", version: "unknown" });
  });

  test("infers npm when npx lives in args[0]", () => {
    const inf = inferNpmPypiFromMcpRow({
      Command: "",
      Args: [String.raw`C:\Program Files\nodejs\npx.cmd`, "-y", "@google-cloud/cloud-run-mcp@2.0.0"],
    });
    assert.deepStrictEqual(inf, {
      ecosystem: "npm",
      name: "@google-cloud/cloud-run-mcp",
      version: "2.0.0",
    });
  });

  test("parses mcp.json mcpServers map", () => {
    const servers = parseMcpConfigJson(
      JSON.stringify({
        mcpServers: {
          foo: { command: "npx", args: ["-y", "bar@1.0.0"] },
        },
      }),
    );
    assert.strictEqual(servers.length, 1);
    assert.strictEqual(servers[0].id, "foo");
    assert.strictEqual(servers[0].command, "npx");
  });
});
