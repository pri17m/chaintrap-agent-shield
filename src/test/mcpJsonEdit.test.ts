import * as assert from "assert";
import { applyDeltaFindings, isSameActionTarget, liveInventoryKeyForFinding } from "../ui/findingMerge";
import { pinMcpServerById, suggestedPinVersion } from "../store/pinMcp";
import { removeMcpServerById, removePackageJsonDependency } from "../store/uninstall";
import type { Finding, InventoryItem } from "../types";

const dogfood = `{
  "mcpServers": {
    "postman": {
      "command": "npx",
      "args": ["-y", "@postman/postman-mcp-cli@1.0.4"]
    },
    "docs": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp"]
    },
    "remote-example": {
      "url": "https://example.invalid/mcp"
    },
    "docker-example": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "example.invalid/mcp-never-start"]
    }
  }
}
`;

function finding(partial: Partial<Finding> & Pick<Finding, "id">): Finding {
  return {
    source: "baseline",
    surface: "mcp",
    severity: "info",
    title: "finding",
    message: "msg",
    path: "/repo/.cursor/mcp.json",
    acknowledged: false,
    createdAt: "2026-09-05T00:00:00.000Z",
    ...partial,
  };
}

suite("mcp.json surgical edit", () => {
  test("pin only changes the unpinned package token and keeps indent", () => {
    const { next, pinned } = pinMcpServerById(dogfood, "docs", "0.4.1");
    assert.strictEqual(pinned, true);
    assert.match(next, /"args": \["-y", "chrome-devtools-mcp@0\.4\.1"\]/);
    assert.ok(next.includes(`    "remote-example": {`));
    assert.ok(next.includes(`      "url": "https://example.invalid/mcp"`));
    assert.ok(next.includes(`    "docker-example": {`));
    assert.ok(next.includes(`      "args": ["-y", "@postman/postman-mcp-cli@1.0.4"]`));
    assert.ok(!next.includes("\n        \"-y\""));
    JSON.parse(next);
  });

  test("pin keeps 4-space indent", () => {
    const raw = `{
    "mcpServers": {
        "docs": {
            "command": "npx",
            "args": ["-y", "chrome-devtools-mcp"]
        }
    }
}
`;
    const { next, pinned } = pinMcpServerById(raw, "docs", "0.4.1");
    assert.strictEqual(pinned, true);
    assert.ok(next.includes(`        "docs": {`));
    assert.ok(next.includes(`            "args": ["-y", "chrome-devtools-mcp@0.4.1"]`));
    assert.ok(!next.includes(`\n  "mcpServers"`));
    JSON.parse(next);
  });

  test("delete middle server keeps remaining entries and indent", () => {
    const { next, removed } = removeMcpServerById(dogfood, "docs");
    assert.deepStrictEqual(removed, ["docs"]);
    const doc = JSON.parse(next) as { mcpServers: Record<string, unknown> };
    assert.ok(doc.mcpServers.postman);
    assert.ok(doc.mcpServers["remote-example"]);
    assert.ok(!doc.mcpServers.docs);
    assert.ok(next.includes(`    "postman": {`));
    assert.ok(next.includes(`    "remote-example": {`));
    assert.ok(!next.includes("chrome-devtools-mcp"));
  });

  test("delete last server drops the previous trailing comma", () => {
    const { next, removed } = removeMcpServerById(dogfood, "docker-example");
    assert.deepStrictEqual(removed, ["docker-example"]);
    JSON.parse(next);
    assert.ok(!next.includes("docker-example"));
    assert.match(next, /"remote-example": \{[\s\S]*\}\s*\n  \}\s*\n\}/);
  });

  test("package.json uninstall keeps the file's indent", () => {
    const raw = `{
    "dependencies": {
        "nx": "20.9.0",
        "lodash": "4.17.20"
    }
}
`;
    const next = removePackageJsonDependency(raw, "nx");
    assert.ok(next.includes(`    "dependencies": {`));
    assert.ok(next.includes(`        "lodash": "4.17.20"`));
    assert.ok(!next.includes("nx"));
    JSON.parse(next);
  });
});

suite("pin version choice", () => {
  test("suggested pin is the resolved latest, not a made-up number", () => {
    assert.strictEqual(
      suggestedPinVersion(
        finding({
          id: "docs",
          packageName: "chrome-devtools-mcp",
          version: "unknown",
          resolvedVersion: "0.4.1",
          mcpId: "docs",
        }),
      ),
      "0.4.1",
    );
    assert.strictEqual(
      suggestedPinVersion(
        finding({
          id: "docs",
          packageName: "chrome-devtools-mcp",
          version: "unknown",
          resolvedVersion: "latest",
          mcpId: "docs",
        }),
      ),
      undefined,
    );
  });
});

suite("action dismiss + prune", () => {
  test("isSameActionTarget matches the MCP server that was pinned or deleted", () => {
    const acted = finding({ id: "unpin-docs", mcpId: "docs", packageName: "chrome-devtools-mcp", version: "unknown" });
    const same = finding({ id: "other-id", mcpId: "docs", packageName: "chrome-devtools-mcp", version: "unknown" });
    const other = finding({ id: "postman", mcpId: "postman", packageName: "@postman/postman-mcp-cli", version: "1.0.4" });
    assert.strictEqual(isSameActionTarget(same, acted), true);
    assert.strictEqual(isSameActionTarget(other, acted), false);
  });

  test("delta drops unpinned MCP after the server is pinned", () => {
    const existing = [
      finding({
        id: "unpin-docs",
        mcpId: "docs",
        packageName: "chrome-devtools-mcp",
        version: "unknown",
        unverifiedOnline: true,
      }),
    ];
    const liveItems: InventoryItem[] = [
      {
        key: "mcp:/repo/.cursor/mcp.json:docs",
        kind: "mcp",
        path: "/repo/.cursor/mcp.json",
        hash: "new",
        packageName: "chrome-devtools-mcp",
        version: "0.4.1",
        mcpId: "docs",
      },
    ];
    assert.strictEqual(liveInventoryKeyForFinding(existing[0], liveItems), undefined);
    const pruned = applyDeltaFindings(existing, [], {}, new Set(["/repo/.cursor/mcp.json"]), ["/repo"], liveItems);
    assert.deepStrictEqual(pruned, []);
  });
});
