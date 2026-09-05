import * as assert from "assert";
import { fetchLatestPackageVersion, npmRegistryLatestUrl, pypiJsonUrl } from "../api/registryVersion";
import { isPinVersion, pinMcpServerById, pinNpmSpecToken } from "../store/pinMcp";

suite("pinMcp", () => {
  test("isPinVersion accepts exact versions only", () => {
    assert.strictEqual(isPinVersion("1.2.3"), true);
    assert.strictEqual(isPinVersion("0.4.1-beta.1"), true);
    assert.strictEqual(isPinVersion("latest"), false);
    assert.strictEqual(isPinVersion("^1.2.3"), false);
    assert.strictEqual(isPinVersion("*"), false);
    assert.strictEqual(isPinVersion(""), false);
  });

  test("pinNpmSpecToken pins unscoped and scoped args", () => {
    assert.strictEqual(pinNpmSpecToken("chrome-devtools-mcp", "chrome-devtools-mcp", "0.4.0"), "chrome-devtools-mcp@0.4.0");
    assert.strictEqual(pinNpmSpecToken("@scope/w", "@scope/w", "2.0.0"), "@scope/w@2.0.0");
    assert.strictEqual(pinNpmSpecToken("@scope/w@1.0.0", "@scope/w", "2.0.0"), "@scope/w@2.0.0");
    assert.strictEqual(pinNpmSpecToken("-y", "chrome-devtools-mcp", "0.4.0"), "-y");
  });

  test("pinMcpServerById pins one npx server and keeps compact args", () => {
    const raw = JSON.stringify({
      mcpServers: {
        docs: { command: "npx", args: ["-y", "chrome-devtools-mcp"] },
        lodash: { command: "npx", args: ["-y", "lodash@4.17.20"] },
      },
    });
    const { next, pinned, packageName } = pinMcpServerById(raw, "docs", "0.4.0");
    assert.strictEqual(pinned, true);
    assert.strictEqual(packageName, "chrome-devtools-mcp");
    const doc = JSON.parse(next) as { mcpServers: { docs: { args: string[] }; lodash: { args: string[] } } };
    assert.deepStrictEqual(doc.mcpServers.docs.args, ["-y", "chrome-devtools-mcp@0.4.0"]);
    assert.deepStrictEqual(doc.mcpServers.lodash.args, ["-y", "lodash@4.17.20"]);
    assert.match(next, /"args": \["-y", "chrome-devtools-mcp@0\.4\.0"\]/);
  });

  test("pinMcpServerById no-ops unknown id or python -m", () => {
    const raw = JSON.stringify({
      mcpServers: {
        docs: { command: "npx", args: ["-y", "chrome-devtools-mcp"] },
        py: { command: "python", args: ["-m", "code_review_graph"] },
      },
    });
    assert.strictEqual(pinMcpServerById(raw, "missing", "1.0.0").pinned, false);
    assert.strictEqual(pinMcpServerById(raw, "py", "1.0.0").pinned, false);
  });
});

suite("registryVersion", () => {
  test("npmRegistryLatestUrl encodes scoped names", () => {
    assert.strictEqual(npmRegistryLatestUrl("left-pad"), "https://registry.npmjs.org/left-pad/latest");
    assert.strictEqual(npmRegistryLatestUrl("@zapier/zapier-sdk"), "https://registry.npmjs.org/@zapier%2Fzapier-sdk/latest");
  });

  test("pypiJsonUrl encodes the project name", () => {
    assert.strictEqual(pypiJsonUrl("Markdown"), "https://pypi.org/pypi/Markdown/json");
  });

  test("fetchLatestPackageVersion reads npm latest.version", async () => {
    const fakeFetch: typeof fetch = async (url) => {
      assert.strictEqual(String(url), "https://registry.npmjs.org/left-pad/latest");
      return { ok: true, json: async () => ({ version: "1.3.0" }) } as Response;
    };
    const v = await fetchLatestPackageVersion("npm", "left-pad", fakeFetch);
    assert.strictEqual(v, "1.3.0");
  });

  test("fetchLatestPackageVersion rejects dist-tags", async () => {
    const fakeFetch: typeof fetch = async () =>
      ({ ok: true, json: async () => ({ version: "latest" }) }) as Response;
    const v = await fetchLatestPackageVersion("npm", "left-pad", fakeFetch);
    assert.strictEqual(v, undefined);
  });
});
