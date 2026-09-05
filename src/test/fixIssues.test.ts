import * as assert from "assert";
import { applyFixToText } from "../store/fixApply";
import { formatFixPreview, planFixActions } from "../store/fixPlan";
import { pickCleanVersion } from "../store/pickCleanVersion";
import { pinPackageJsonDependency, pinRequirementVersion } from "../store/pinManifest";
import { implicitSameMajorRange, satisfiesRange } from "../scanners/pinSpec";
import type { Finding } from "../types";

function f(partial: Partial<Finding> & Pick<Finding, "id">): Finding {
  return {
    source: "baseline",
    surface: "package",
    severity: "info",
    title: "finding",
    message: "msg",
    path: "/repo/package.json",
    acknowledged: false,
    createdAt: "2026-09-05T00:00:00.000Z",
    ...partial,
  };
}

function fakeRegistryOsv(opts: {
  versions: string[];
  dirty?: string[];
  malware?: string[];
  registryDown?: boolean;
  osvDown?: boolean;
}): typeof fetch {
  const dirty = new Set(opts.dirty || []);
  const malware = new Set(opts.malware || []);
  return async (url, init) => {
    const href = String(url);
    const method = String(init?.method || "GET").toUpperCase();
    if (method === "POST") {
      if (opts.osvDown) {
        throw new Error("osv down");
      }
      const body = JSON.parse(String(init?.body || "{}")) as {
        queries: Array<{ version?: string }>;
      };
      return {
        ok: true,
        json: async () => ({
          results: (body.queries || []).map((q) => {
            const v = q.version || "";
            if (malware.has(v)) {
              return { vulns: [{ id: "MAL-2024-1" }] };
            }
            if (dirty.has(v)) {
              return { vulns: [{ id: "GHSA-xxxx-yyyy-zzzz" }] };
            }
            return { vulns: [] };
          }),
        }),
      } as Response;
    }
    if (opts.registryDown) {
      return { ok: false, json: async () => ({}) } as Response;
    }
    if (href.includes("pypi.org")) {
      const releases: Record<string, unknown[]> = {};
      for (const v of opts.versions) {
        releases[v] = [];
      }
      return { ok: true, json: async () => ({ info: { version: opts.versions[opts.versions.length - 1] }, releases }) } as Response;
    }
    const versions: Record<string, unknown> = {};
    for (const v of opts.versions) {
      versions[v] = {};
    }
    return { ok: true, json: async () => ({ versions, version: opts.versions[opts.versions.length - 1] }) } as Response;
  };
}

suite("satisfiesRange", () => {
  test("caret stays in major; gte accepts later majors", () => {
    assert.strictEqual(satisfiesRange("^4.17.20", "4.17.21"), true);
    assert.strictEqual(satisfiesRange("^4.17.20", "5.0.0"), false);
    assert.strictEqual(satisfiesRange(">=1.0.0", "9.9.9"), true);
    assert.strictEqual(satisfiesRange("*", "1.2.3"), true);
    assert.strictEqual(satisfiesRange("latest", "1.2.3"), true);
    assert.strictEqual(satisfiesRange("file:../x", "1.0.0"), false);
    assert.strictEqual(implicitSameMajorRange("4.17.20"), "^4.17.20");
    assert.strictEqual(implicitSameMajorRange("3.8"), "^3.8.0");
    assert.strictEqual(satisfiesRange("^3.8.0", "3.10.3"), true);
    assert.strictEqual(satisfiesRange("^2.8.2", "2.9.0.post0"), true);
  });
});

suite("pickCleanVersion", () => {
  test("range ^ picks highest in-range clean, not a dirty major", async () => {
    const picked = await pickCleanVersion({
      ecosystem: "npm",
      name: "lodash",
      spec: "^4.17.20",
      fetchImpl: fakeRegistryOsv({ versions: ["4.17.20", "4.17.21", "5.0.0"], dirty: ["4.17.20", "5.0.0"] }),
    });
    assert.strictEqual(picked.version, "4.17.21");
  });

  test("gte picks latest clean", async () => {
    const picked = await pickCleanVersion({
      ecosystem: "npm",
      name: "foo",
      spec: ">=1.0.0",
      fetchImpl: fakeRegistryOsv({ versions: ["1.0.0", "1.2.0", "2.0.0"], dirty: ["1.2.0"] }),
    });
    assert.strictEqual(picked.version, "2.0.0");
  });

  test("unpinned star never returns the token latest", async () => {
    const picked = await pickCleanVersion({
      ecosystem: "npm",
      name: "chrome-devtools-mcp",
      spec: "*",
      fetchImpl: fakeRegistryOsv({ versions: ["0.3.0", "0.4.1"] }),
    });
    assert.strictEqual(picked.version, "0.4.1");
  });

  test("OSV down skips instead of picking", async () => {
    const picked = await pickCleanVersion({
      ecosystem: "npm",
      name: "lodash",
      spec: "^4.17.20",
      fetchImpl: fakeRegistryOsv({ versions: ["4.17.21"], osvDown: true }),
    });
    assert.strictEqual(picked.version, undefined);
    assert.match(picked.reason || "", /OSV/);
  });

  test("only dirty versions in range skips", async () => {
    const picked = await pickCleanVersion({
      ecosystem: "npm",
      name: "lodash",
      spec: "^4.17.20",
      fetchImpl: fakeRegistryOsv({ versions: ["4.17.20", "4.17.21", "5.0.0"], dirty: ["4.17.20", "4.17.21"] }),
    });
    assert.strictEqual(picked.version, undefined);
    assert.match(picked.reason || "", /no clean version/);
  });
});

suite("plan and apply Fix issues", () => {
  const mcpDogfood = `{
  "mcpServers": {
    "postman": {
      "command": "npx",
      "args": ["-y", "@postman/postman-mcp-cli@1.0.4"]
    },
    "docs": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp"]
    }
  }
}
`;

  test("range pin writes in-range clean and keeps indent", async () => {
    const raw = `{
    "dependencies": {
        "lodash": "^4.17.20",
        "left-pad": "1.3.0"
    }
}
`;
    const finding = f({
      id: "lodash-range",
      packageName: "lodash",
      ecosystem: "npm",
      version: "unknown",
      spec: "^4.17.20",
      coverageKind: "not-exact",
      coverageNote: true,
    });
    const actions = await planFixActions(
      [finding],
      fakeRegistryOsv({ versions: ["4.17.20", "4.17.21", "5.0.0"], dirty: ["4.17.20", "5.0.0"] }),
    );
    assert.strictEqual(actions[0].kind, "pin");
    assert.strictEqual(actions[0].version, "4.17.21");
    assert.match(actions[0].label, /because .*range \^4\.17\.20 is not an exact pin/);
    const { next, ok } = applyFixToText(actions[0], raw);
    assert.strictEqual(ok, true);
    assert.ok(next.includes(`        "lodash": "4.17.21"`));
    assert.ok(next.includes(`        "left-pad": "1.3.0"`));
    JSON.parse(next);
  });

  test("vulnerable exact stays in same major", async () => {
    const finding = f({
      id: "lodash-vuln",
      packageName: "lodash",
      ecosystem: "npm",
      version: "4.17.20",
      severity: "medium",
      malicious: false,
      title: "This npm package is vulnerable",
    });
    const actions = await planFixActions(
      [finding],
      fakeRegistryOsv({ versions: ["4.17.20", "4.17.21", "5.0.0"], dirty: ["4.17.20", "5.0.0"] }),
    );
    assert.strictEqual(actions[0].version, "4.17.21");
    assert.match(actions[0].label, /because vulnerable \(CVE\/GHSA\)/);
    assert.ok(!actions[0].label.includes("later version"));
  });

  test("two-part PyPI pin upgrades within major", async () => {
    const finding = f({
      id: "markdown",
      packageName: "markdown",
      ecosystem: "pypi",
      version: "3.8",
      path: "/repo/requirements.txt",
      severity: "medium",
      malicious: false,
      title: "This PyPI package is vulnerable",
    });
    const actions = await planFixActions(
      [finding],
      fakeRegistryOsv({ versions: ["3.8", "3.8.2", "3.10.3"], dirty: ["3.8"] }),
    );
    assert.strictEqual(actions[0].kind, "pin");
    assert.strictEqual(actions[0].version, "3.10.3");
  });

  test("vulnerable PyPI jumps major when every same-major release is dirty", async () => {
    const finding = f({
      id: "jinja2",
      packageName: "jinja2",
      ecosystem: "pypi",
      version: "2.10.1",
      path: "/repo/requirements.txt",
      severity: "high",
      malicious: false,
      title: "This PyPI package is vulnerable",
    });
    const actions = await planFixActions(
      [finding],
      fakeRegistryOsv({ versions: ["2.10.1", "2.11.3", "3.1.6"], dirty: ["2.10.1", "2.11.3"] }),
    );
    assert.strictEqual(actions[0].kind, "pin");
    assert.strictEqual(actions[0].version, "3.1.6");
    assert.match(actions[0].label, /later version/);
  });

  test("unpinned MCP pins highest clean and keeps compact neighbors", async () => {
    const finding = f({
      id: "docs",
      surface: "mcp",
      path: "/repo/.cursor/mcp.json",
      mcpId: "docs",
      packageName: "chrome-devtools-mcp",
      ecosystem: "npm",
      version: "unknown",
      unverifiedOnline: true,
    });
    const actions = await planFixActions([finding], fakeRegistryOsv({ versions: ["0.3.0", "0.4.1"] }));
    assert.strictEqual(actions[0].kind, "pin");
    assert.strictEqual(actions[0].version, "0.4.1");
    assert.match(actions[0].label, /because no version in the config/);
    const { next, ok } = applyFixToText(actions[0], mcpDogfood);
    assert.strictEqual(ok, true);
    assert.match(next, /"args": \["-y", "chrome-devtools-mcp@0\.4\.1"\]/);
    assert.ok(next.includes(`      "args": ["-y", "@postman/postman-mcp-cli@1.0.4"]`));
    JSON.parse(next);
  });

  test("malicious delete plus pin in one plan leaves valid JSON", async () => {
    const actions = [
      {
        kind: "delete" as const,
        finding: f({
          id: "postman",
          surface: "mcp",
          path: "/repo/.cursor/mcp.json",
          mcpId: "postman",
          packageName: "@postman/postman-mcp-cli",
          version: "1.0.4",
          malicious: true,
          severity: "critical",
          title: "This npm package is malicious",
        }),
        label: "Delete MCP postman",
      },
      {
        kind: "pin" as const,
        finding: f({
          id: "docs",
          surface: "mcp",
          path: "/repo/.cursor/mcp.json",
          mcpId: "docs",
          packageName: "chrome-devtools-mcp",
          ecosystem: "npm",
          version: "unknown",
        }),
        version: "0.4.1",
        label: "Pin docs",
      },
    ];
    let raw = mcpDogfood;
    for (const action of actions) {
      const step = applyFixToText(action, raw);
      assert.strictEqual(step.ok, true);
      raw = step.next;
    }
    const doc = JSON.parse(raw) as { mcpServers: Record<string, { args?: string[] }> };
    assert.strictEqual(doc.mcpServers.postman, undefined);
    assert.deepStrictEqual(doc.mcpServers.docs.args, ["-y", "chrome-devtools-mcp@0.4.1"]);
  });

  test("compact one-line mcp.json stays one line after pin", () => {
    const raw = `{"mcpServers":{"docs":{"command":"npx","args":["-y","chrome-devtools-mcp"]}}}`;
    const { next, ok } = applyFixToText(
      {
        kind: "pin",
        finding: f({
          id: "docs",
          surface: "mcp",
          path: "/r/mcp.json",
          mcpId: "docs",
          packageName: "chrome-devtools-mcp",
          ecosystem: "npm",
        }),
        version: "0.4.1",
        label: "pin",
      },
      raw,
    );
    assert.strictEqual(ok, true);
    assert.ok(!next.includes("\n"));
    JSON.parse(next);
  });

  test("unchecked and git spec are skipped; file unchanged", async () => {
    const actions = await planFixActions([
      f({
        id: "remote",
        surface: "mcp",
        path: "/repo/.cursor/mcp.json",
        mcpId: "remote",
        coverageKind: "unchecked-mcp",
        coverageNote: true,
      }),
      f({
        id: "git",
        packageName: "foo",
        ecosystem: "npm",
        spec: "github:foo/bar",
        version: "unknown",
        coverageKind: "not-exact",
      }),
    ]);
    assert.ok(actions.every((a) => a.kind === "skip"));
    const raw = mcpDogfood;
    assert.strictEqual(applyFixToText(actions[0], raw).ok, false);
  });

  test("package.json and requirements writers", () => {
    const pkg = pinPackageJsonDependency(
      `{
  "dependencies": {
    "lodash": "^4.17.20"
  }
}
`,
      "lodash",
      "4.17.21",
    );
    assert.strictEqual(pkg.changed, true);
    assert.match(pkg.next, /"lodash": "4\.17\.21"/);
    const req = pinRequirementVersion("requests>=2.31.0\nboto4==1.0.2\n", "requests", "2.32.0");
    assert.strictEqual(req.changed, true);
    assert.match(req.next, /requests==2\.32\.0/);
    assert.match(req.next, /boto4==1\.0\.2/);
  });

  test("malicious delete label says why", async () => {
    const actions = await planFixActions([
      f({
        id: "evil",
        packageName: "evil",
        ecosystem: "npm",
        version: "1.0.0",
        malicious: true,
        severity: "critical",
        title: "This npm package is malicious",
      }),
    ]);
    assert.strictEqual(actions[0].kind, "delete");
    assert.match(actions[0].label, /because it is malicious \(known-bad or OSV malware\)/);
  });

  test("preview lists delete pin skip counts", () => {
    const text = formatFixPreview([
      { kind: "delete", finding: f({ id: "a" }), label: "Delete a" },
      { kind: "pin", finding: f({ id: "b" }), label: "Pin b", version: "1.0.0" },
      { kind: "skip", finding: f({ id: "c" }), label: "Skip c" },
    ]);
    assert.match(text, /1 delete \(malicious\), 1 pin\/upgrade, 1 skip/);
    assert.match(text, /DELETE — malware \/ denylist/);
    assert.match(text, /PIN \/ UPGRADE/);
    assert.match(text, /SKIP — left unchanged/);
  });
});
