import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { queryOsvQuerybatch } from "../api/osvClient";
import {
  parseBunLockBody,
  parseCargoLock,
  parseComposerLock,
  parseConanLock,
  parseGemfileLock,
  parseGithubWorkflowUses,
  parseGoMod,
  parseGoSum,
  parseGradleLockfile,
  parseMixLock,
  parseNugetPackagesLock,
  parsePackageResolved,
  parsePomXml,
  parsePubspecLock,
  parsePyprojectToml,
  parseRenvLock,
} from "../scanners/ecoParsers";
import { ecosystemLabel, isExactVersionString, isWritableEcosystem, osvEcosystemName } from "../scanners/ecosystems";
import { inventoryWorkspaceRoot } from "../scanners/inventory";
import { inferNpmPypiFromMcpRow } from "../scanners/mcpParser";
import { shouldSkipFinding } from "../store/fixPlan";
import { analyzeItems } from "../scanners/itemAnalyzer";
import { summarizeInventory } from "../ui/postureModel";
import type { Finding } from "../types";

suite("multi-ecosystem parsers", () => {
  test("pom.xml extracts Maven coordinates", () => {
    const pkgs = parsePomXml(`<project>
      <dependencies>
        <dependency>
          <groupId>io.modelcontextprotocol</groupId>
          <artifactId>kotlin-sdk</artifactId>
          <version>0.13.0</version>
        </dependency>
        <dependency>
          <groupId>org.example</groupId>
          <artifactId>skip-me</artifactId>
          <version>\${rev}</version>
        </dependency>
      </dependencies>
    </project>`);
    assert.ok(pkgs.some((p) => p.name === "io.modelcontextprotocol:kotlin-sdk" && p.version === "0.13.0"));
    assert.ok(pkgs.some((p) => p.name === "org.example:skip-me" && p.version === "unknown"));
  });

  test("go.mod go.sum cargo bun pyproject gem nuget composer gha pub mix swift renv conan", () => {
    assert.ok(parseGoMod("require github.com/foo/bar v1.2.3\n").some((p) => p.name === "github.com/foo/bar" && p.version === "v1.2.3"));
    assert.ok(parseGoSum("github.com/foo/bar v1.2.3 h1:abc\ngithub.com/foo/bar v1.2.3/go.mod h1:def\n").length === 1);
    assert.ok(parseCargoLock('[[package]]\nname = "serde"\nversion = "1.0.0"\n').some((p) => p.name === "serde"));
    assert.ok(parseBunLockBody('{"lockfileVersion":1,"packages":{"lodash":["lodash@4.17.21"]}}').some((p) => p.name === "lodash" && p.version === "4.17.21"));
    assert.ok(parsePyprojectToml('[project]\ndependencies = ["requests==2.31.0", "flask>=2"]\n').some((p) => p.name === "requests" && p.version === "2.31.0"));
    assert.ok(parseGemfileLock("GEM\n  specs:\n    rails (7.0.8)\n      actionpack (= 7.0.8)\n").some((p) => p.name === "rails" && p.version === "7.0.8"));
    assert.ok(
      parseNugetPackagesLock(JSON.stringify({ dependencies: { net8: { "Newtonsoft.Json": { resolved: "13.0.1" } } } })).some(
        (p) => p.name === "Newtonsoft.Json" && p.version === "13.0.1",
      ),
    );
    assert.ok(
      parseComposerLock(JSON.stringify({ packages: [{ name: "vendor/pkg", version: "v1.2.3" }] })).some((p) => p.name === "vendor/pkg" && p.version === "1.2.3"),
    );
    const gha = parseGithubWorkflowUses("jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n      - uses: docker://alpine:3\n      - uses: ./local\n");
    assert.ok(gha.some((p) => p.name === "actions/checkout" && p.version === "v4"));
    assert.ok(!gha.some((p) => p.name.startsWith("docker://") || p.name.startsWith("./")));
    assert.ok(parsePubspecLock("packages:\n  http:\n    version: \"1.2.0\"\n").some((p) => p.name === "http"));
    assert.ok(parseMixLock('"phoenix": {:hex, :phoenix, "1.7.10", "abc", [:mix], [], "hexpm", "def"}').some((p) => p.name === "phoenix"));
    assert.ok(
      parsePackageResolved(JSON.stringify({ pins: [{ identity: "swift-arg", location: "https://github.com/apple/swift-argument-parser", state: { version: "1.2.3" } }] })).some(
        (p) => p.name.includes("swift-argument-parser") && p.version === "1.2.3",
      ),
    );
    assert.ok(parseRenvLock(JSON.stringify({ Packages: { jsonlite: { Package: "jsonlite", Version: "1.8.0" } } })).some((p) => p.name === "jsonlite"));
    assert.ok(parseConanLock(JSON.stringify({ requires: ["zlib/1.2.13"] })).some((p) => p.name === "zlib" && p.version === "1.2.13"));
    assert.ok(parseGradleLockfile("org.apache.commons:commons-lang3:3.12.0=compileClasspath\nempty=annotationProcessor\n").some((p) => p.version === "3.12.0"));
  });

  test("OSV ecosystem map", () => {
    assert.strictEqual(osvEcosystemName("maven"), "Maven");
    assert.strictEqual(osvEcosystemName("crates"), "crates.io");
    assert.strictEqual(osvEcosystemName("github_actions"), "GitHub Actions");
    assert.strictEqual(ecosystemLabel("pypi"), "PyPI");
    assert.ok(isWritableEcosystem("npm"));
    assert.ok(isWritableEcosystem("maven"));
    assert.ok(!isWritableEcosystem("swift"));
    assert.ok(!isWritableEcosystem("hex"));
    assert.ok(isExactVersionString("0.13.0"));
    assert.ok(isExactVersionString("v1.2.3"));
    assert.ok(!isExactVersionString("^1.0.0"));
  });
});

suite("multi-ecosystem inventory", () => {
  test("Maven kotlin-sdk pin is inventoried and queried as Maven", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "eco-maven-"));
    fs.writeFileSync(
      path.join(root, "pom.xml"),
      `<project><dependencies><dependency>
        <groupId>io.modelcontextprotocol</groupId>
        <artifactId>kotlin-sdk</artifactId>
        <version>0.13.0</version>
      </dependency></dependencies></project>`,
      "utf8",
    );
    const items = inventoryWorkspaceRoot(root);
    const pin = items.find((i) => i.packageName === "io.modelcontextprotocol:kotlin-sdk");
    assert.ok(pin);
    assert.strictEqual(pin!.ecosystem, "maven");
    assert.strictEqual(pin!.version, "0.13.0");
    assert.ok(items.some((i) => i.kind === "coverage" && i.ecosystem === "maven" && i.coverageKind === "no-lockfile"));
    const summary = summarizeInventory(items, true);
    assert.strictEqual(summary.pinsByEcosystem.maven, 1);

    let posted = "";
    const fakeFetch: typeof fetch = async (_url, init) => {
      posted = String(init?.body || "");
      return { ok: true, json: async () => ({ results: [{ vulns: [{ id: "CVE-2026-63658" }] }] }) } as Response;
    };
    await queryOsvQuerybatch([{ ecosystem: "maven", name: "io.modelcontextprotocol:kotlin-sdk", version: "0.13.0" }], fakeFetch);
    assert.match(posted, /"ecosystem":"Maven"/);

    const findings = await analyzeItems(items, "baseline", fakeFetch);
    assert.ok(findings.some((f) => f.coverageNote && f.ecosystem === "maven"));
  });

  test("Gradle DSL without lockfile is unscanned coverage", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "eco-gradle-"));
    fs.writeFileSync(path.join(root, "build.gradle.kts"), "plugins { kotlin(\"jvm\") }\n", "utf8");
    const items = inventoryWorkspaceRoot(root);
    assert.ok(items.some((i) => i.kind === "coverage" && i.coverageKind === "unscanned" && i.ecosystem === "maven"));
  });

  test("go.sum Cargo.lock bun.lock pyproject Gemfile.lock composer.lock workflows", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "eco-mix-"));
    fs.writeFileSync(path.join(root, "go.sum"), "github.com/foo/bar v1.2.3 h1:abc\n", "utf8");
    fs.writeFileSync(path.join(root, "Cargo.lock"), '[[package]]\nname = "serde"\nversion = "1.0.152"\n', "utf8");
    fs.writeFileSync(path.join(root, "bun.lock"), '{"lockfileVersion":1,"packages":{"left-pad":["left-pad@1.3.0"]}}', "utf8");
    fs.mkdirSync(path.join(root, "py"));
    fs.writeFileSync(path.join(root, "py", "pyproject.toml"), '[project]\ndependencies = ["requests==2.31.0"]\n', "utf8");
    fs.writeFileSync(path.join(root, "Gemfile.lock"), "GEM\n  specs:\n    rails (7.0.8)\n", "utf8");
    fs.writeFileSync(path.join(root, "composer.lock"), JSON.stringify({ packages: [{ name: "psr/log", version: "3.0.0" }] }), "utf8");
    fs.mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });
    fs.writeFileSync(path.join(root, ".github", "workflows", "ci.yml"), "jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n", "utf8");
    const items = inventoryWorkspaceRoot(root);
    assert.ok(items.some((i) => i.ecosystem === "go" && i.packageName === "github.com/foo/bar"));
    assert.ok(items.some((i) => i.ecosystem === "crates" && i.packageName === "serde"));
    assert.ok(items.some((i) => i.ecosystem === "npm" && i.packageName === "left-pad"));
    assert.ok(items.some((i) => i.ecosystem === "pypi" && i.packageName === "requests"));
    assert.ok(items.some((i) => i.ecosystem === "rubygems" && i.packageName === "rails"));
    assert.ok(items.some((i) => i.ecosystem === "packagist" && i.packageName === "psr/log"));
    assert.ok(items.some((i) => i.ecosystem === "github_actions" && i.packageName === "actions/checkout"));
  });

  test("unparseable Gemfile mix.exs Package.swift conanfile are coverage gaps", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "eco-gap-"));
    fs.writeFileSync(path.join(root, "Gemfile"), "gem 'rails'\n", "utf8");
    fs.writeFileSync(path.join(root, "mix.exs"), "defmodule App do\nend\n", "utf8");
    fs.writeFileSync(path.join(root, "Package.swift"), "// swift-tools-version: 5.9\n", "utf8");
    fs.writeFileSync(path.join(root, "conanfile.txt"), "[requires]\nzlib/1.2.13\n", "utf8");
    const items = inventoryWorkspaceRoot(root);
    assert.ok(items.some((i) => i.ecosystem === "rubygems" && i.packageName === "rails" && i.pinExact === false));
    assert.ok(items.some((i) => i.coverageKind === "no-lockfile" && i.ecosystem === "rubygems"));
    assert.ok(items.some((i) => i.coverageKind === "unscanned" && i.ecosystem === "hex"));
    assert.ok(items.some((i) => i.coverageKind === "unscanned" && i.ecosystem === "swift"));
    assert.ok(items.some((i) => i.coverageKind === "unscanned" && i.ecosystem === "conan"));
  });
});

suite("multi-ecosystem MCP + fix skip", () => {
  test("infers go cargo pipx", () => {
    assert.deepStrictEqual(inferNpmPypiFromMcpRow({ command: "go", args: ["run", "github.com/foo/bar@v1.2.3"] }), {
      ecosystem: "go",
      name: "github.com/foo/bar",
      version: "v1.2.3",
    });
    assert.deepStrictEqual(inferNpmPypiFromMcpRow({ command: "cargo", args: ["install", "ripgrep", "--version", "14.0.0"] }), {
      ecosystem: "crates",
      name: "ripgrep",
      version: "14.0.0",
    });
    assert.deepStrictEqual(inferNpmPypiFromMcpRow({ command: "pipx", args: ["run", "httpx==0.27.0"] }), {
      ecosystem: "pypi",
      name: "httpx",
      version: "0.27.0",
    });
  });

  test("Fix issues pins Maven pom.xml when the file exists", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "eco-fix-maven-"));
    const pom = path.join(root, "pom.xml");
    fs.writeFileSync(
      pom,
      `<project><dependencies><dependency>
        <groupId>io.modelcontextprotocol</groupId>
        <artifactId>kotlin-sdk</artifactId>
        <version>0.13.0</version>
      </dependency></dependencies></project>`,
      "utf8",
    );
    const f: Finding = {
      id: "m",
      source: "baseline",
      surface: "package",
      severity: "high",
      title: "vuln",
      message: "msg",
      path: pom,
      packageName: "io.modelcontextprotocol:kotlin-sdk",
      version: "0.13.0",
      ecosystem: "maven",
      acknowledged: false,
      createdAt: "2026-09-07T00:00:00.000Z",
      workspaceRoot: root,
    };
    assert.strictEqual(shouldSkipFinding(f), undefined);
  });

  test("Fix issues skips hashed Cargo.lock without Cargo.toml", () => {
    const f: Finding = {
      id: "c",
      source: "baseline",
      surface: "package",
      severity: "medium",
      title: "vuln",
      message: "msg",
      path: "/tmp/missing-lock/Cargo.lock",
      packageName: "time",
      version: "0.1.44",
      ecosystem: "crates",
      acknowledged: false,
      createdAt: "2026-09-07T00:00:00.000Z",
    };
    assert.strictEqual(shouldSkipFinding(f), "hashed lockfile only; add a sibling manifest");
  });

  test("Fix issues skips Swift", () => {
    const f: Finding = {
      id: "s",
      source: "baseline",
      surface: "package",
      severity: "medium",
      title: "vuln",
      message: "msg",
      path: "/tmp/Package.resolved",
      packageName: "github.com/apple/swift-nio",
      version: "2.32.0",
      ecosystem: "swift",
      acknowledged: false,
      createdAt: "2026-09-07T00:00:00.000Z",
    };
    assert.strictEqual(shouldSkipFinding(f), "Swift Package.swift is source; not edited");
  });
});
