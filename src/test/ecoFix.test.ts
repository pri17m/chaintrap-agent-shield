import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parseCargoToml, parseGoMod, parsePomXml } from "../scanners/ecoParsers";
import { normalizePackageName } from "../scanners/ecosystems";
import { applyFixToText } from "../store/fixApply";
import {
  pinCabalFreeze,
  pinCargoTomlDep,
  pinComposerJson,
  pinConanLock,
  pinGemfileGem,
  pinGithubUses,
  pinGoModRequire,
  pinNugetLock,
  pinPomDependency,
  pinPubspecDep,
  pinRenvLock,
  removePomDependency,
} from "../store/ecoManifest";
import { pinGoSpecToken, pinMcpServerById } from "../store/pinMcp";
import type { Finding } from "../types";
import { groupFindingsByEcosystem } from "../ui/findingGroups";

function finding(partial: Partial<Finding> & Pick<Finding, "id" | "path" | "ecosystem">): Finding {
  return {
    source: "baseline",
    surface: "package",
    severity: "medium",
    title: "vuln",
    message: "msg",
    acknowledged: false,
    createdAt: "2026-09-07T00:00:00.000Z",
    packageName: "pkg",
    version: "1.0.0",
    ...partial,
  };
}

suite("normalizePackageName case", () => {
  test("preserves Maven and NuGet case", () => {
    assert.strictEqual(normalizePackageName("nuget", "System.Text.Encodings.Web"), "System.Text.Encodings.Web");
    assert.strictEqual(normalizePackageName("maven", "org.apache.logging.log4j:log4j-core"), "org.apache.logging.log4j:log4j-core");
    assert.strictEqual(normalizePackageName("npm", "Lodash"), "lodash");
  });
});

suite("groupFindingsByEcosystem", () => {
  test("orders Maven after npm/pypi", () => {
    const groups = groupFindingsByEcosystem([
      finding({ id: "m", path: "/p/pom.xml", ecosystem: "maven", packageName: "g:a" }),
      finding({ id: "n", path: "/p/package.json", ecosystem: "npm", packageName: "lodash" }),
    ]);
    assert.deepStrictEqual(
      groups.map((g) => g.ecosystem),
      ["npm", "maven"],
    );
  });
});

suite("eco manifest writers", () => {
  test("pom.xml pins one dependency and keeps the other", () => {
    const raw = `<project>
      <dependencies>
        <dependency>
          <groupId>org.apache.logging.log4j</groupId>
          <artifactId>log4j-core</artifactId>
          <version>2.14.1</version>
        </dependency>
        <dependency>
          <groupId>commons-collections</groupId>
          <artifactId>commons-collections</artifactId>
          <version>3.2.1</version>
        </dependency>
      </dependencies>
    </project>`;
    const { next, changed } = pinPomDependency(raw, "org.apache.logging.log4j:log4j-core", "2.17.2");
    assert.ok(changed);
    const pkgs = parsePomXml(next);
    assert.ok(pkgs.some((p) => p.name === "org.apache.logging.log4j:log4j-core" && p.version === "2.17.2"));
    assert.ok(pkgs.some((p) => p.name === "commons-collections:commons-collections" && p.version === "3.2.1"));
    const del = removePomDependency(next, "org.apache.logging.log4j:log4j-core");
    assert.ok(del.changed);
    assert.ok(!parsePomXml(del.next).some((p) => p.name.includes("log4j-core")));
    assert.ok(parsePomXml(del.next).some((p) => p.version === "3.2.1"));
  });

  test("go.mod pins one module in a require block", () => {
    const raw = `module example.com/app

go 1.21

require (
	github.com/gin-gonic/gin v1.6.3
	gopkg.in/yaml.v2 v2.2.2
)
`;
    const { next, changed } = pinGoModRequire(raw, "github.com/gin-gonic/gin", "v1.9.1");
    assert.ok(changed);
    const pkgs = parseGoMod(next);
    assert.ok(pkgs.some((p) => p.name === "github.com/gin-gonic/gin" && p.version === "v1.9.1"));
    assert.ok(pkgs.some((p) => p.name === "gopkg.in/yaml.v2" && p.version === "v2.2.2"));
  });

  test("Cargo.toml pins one crate", () => {
    const raw = `[dependencies]
time = "0.1.44"
openssl = "0.10.35"
`;
    const { next, changed } = pinCargoTomlDep(raw, "time", "0.3.36");
    assert.ok(changed);
    const pkgs = parseCargoToml(next);
    assert.ok(pkgs.some((p) => p.name === "time" && p.version === "0.3.36"));
    assert.ok(pkgs.some((p) => p.name === "openssl" && p.version === "0.10.35"));
  });

  test("Gemfile composer nuget pubspec freeze renv conan github", () => {
    const gem = pinGemfileGem('gem "nokogiri", "1.10.4"\ngem "rack", "2.0.7"\n', "nokogiri", "1.18.0");
    assert.ok(gem.changed);
    assert.match(gem.next, /nokogiri", "1.18.0"/);
    assert.match(gem.next, /rack", "2.0.7"/);

    const composer = pinComposerJson(
      JSON.stringify({ require: { "guzzlehttp/guzzle": "6.5.0", "phpmailer/phpmailer": "6.4.0" } }, null, 4),
      "guzzlehttp/guzzle",
      "7.9.2",
    );
    assert.ok(composer.changed);
    const cdoc = JSON.parse(composer.next) as { require: Record<string, string> };
    assert.strictEqual(cdoc.require["guzzlehttp/guzzle"], "7.9.2");
    assert.strictEqual(cdoc.require["phpmailer/phpmailer"], "6.4.0");

    const nuget = pinNugetLock(
      JSON.stringify({
        dependencies: { net8: { "Newtonsoft.Json": { resolved: "9.0.1" }, Other: { resolved: "1.0.0" } } },
      }),
      "Newtonsoft.Json",
      "13.0.3",
    );
    assert.ok(nuget.changed);
    JSON.parse(nuget.next);

    const pub = pinPubspecDep("dependencies:\n  http: 0.13.0\n  dio: 4.0.0\n", "http", "1.2.2");
    assert.ok(pub.changed);
    assert.match(pub.next, /http: 1\.2\.2/);
    assert.match(pub.next, /dio: 4\.0\.0/);

    const cabal = pinCabalFreeze("constraints: aeson ==1.4.0.0, extra ==1.0", "aeson", "2.2.3.0");
    assert.ok(cabal.changed);
    assert.match(cabal.next, /aeson ==2\.2\.3\.0/);

    const renv = pinRenvLock(
      JSON.stringify({ Packages: { jsonlite: { Package: "jsonlite", Version: "1.6" }, keep: { Package: "keep", Version: "1.0" } } }),
      "jsonlite",
      "1.8.9",
    );
    assert.ok(renv.changed);
    JSON.parse(renv.next);

    const conan = pinConanLock(JSON.stringify({ requires: ["openssl/1.0.2u", "zlib/1.2.11"] }), "openssl", "3.0.15");
    assert.ok(conan.changed);
    JSON.parse(conan.next);

    const gha = pinGithubUses(
      "jobs:\n  a:\n    steps:\n      - uses: tj-actions/changed-files@v45.0.7\n      - uses: actions/checkout@v4\n",
      "tj-actions/changed-files",
      "v46.0.1",
    );
    assert.ok(gha.changed);
    assert.match(gha.next, /changed-files@v46\.0\.1/);
    assert.match(gha.next, /actions\/checkout@v4/);
  });

  test("applyFixToText uses sibling pom path not lockfile", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "eco-apply-"));
    const pom = path.join(root, "pom.xml");
    const raw = `<project><dependencies><dependency>
      <groupId>a</groupId><artifactId>b</artifactId><version>1.0.0</version>
    </dependency><dependency>
      <groupId>c</groupId><artifactId>d</artifactId><version>2.0.0</version>
    </dependency></dependencies></project>`;
    fs.writeFileSync(pom, raw, "utf8");
    const f = finding({
      id: "x",
      path: pom,
      ecosystem: "maven",
      packageName: "a:b",
      version: "1.0.0",
    });
    const { next, ok } = applyFixToText({ kind: "pin", finding: f, version: "1.2.3", label: "pin a:b" }, raw, pom);
    assert.ok(ok);
    assert.ok(parsePomXml(next).some((p) => p.name === "a:b" && p.version === "1.2.3"));
    assert.ok(parsePomXml(next).some((p) => p.name === "c:d" && p.version === "2.0.0"));
  });

  test("broken JSON pin is rejected", () => {
    const raw = "{ not json";
    const { next, changed } = pinComposerJson(raw, "guzzlehttp/guzzle", "7.0.0");
    assert.strictEqual(changed, false);
    assert.strictEqual(next, raw);
  });
});

suite("MCP go cargo pin", () => {
  test("pinGoSpecToken writes v-prefix", () => {
    assert.strictEqual(
      pinGoSpecToken("github.com/gin-gonic/gin@v1.6.3", "github.com/gin-gonic/gin", "v1.9.1"),
      "github.com/gin-gonic/gin@v1.9.1",
    );
  });

  test("pinMcpServerById pins go run module", () => {
    const raw = JSON.stringify({
      mcpServers: {
        gin: { command: "go", args: ["run", "github.com/gin-gonic/gin@v1.6.3"] },
        other: { command: "npx", args: ["-y", "left-pad@1.3.0"] },
      },
    });
    const { next, pinned } = pinMcpServerById(raw, "gin", "v1.9.1");
    assert.strictEqual(pinned, true);
    const doc = JSON.parse(next) as { mcpServers: { gin: { args: string[] }; other: { args: string[] } } };
    assert.deepStrictEqual(doc.mcpServers.gin.args, ["run", "github.com/gin-gonic/gin@v1.9.1"]);
    assert.deepStrictEqual(doc.mcpServers.other.args, ["-y", "left-pad@1.3.0"]);
  });

  test("pinMcpServerById pins cargo --version", () => {
    const raw = JSON.stringify({
      mcpServers: {
        time: { command: "cargo", args: ["install", "time", "--version", "0.1.44"] },
      },
    });
    const { next, pinned } = pinMcpServerById(raw, "time", "0.3.36");
    assert.strictEqual(pinned, true);
    const doc = JSON.parse(next) as { mcpServers: { time: { args: string[] } } };
    assert.ok(doc.mcpServers.time.args.includes("0.3.36") || doc.mcpServers.time.args.some((a) => a.includes("@0.3.36")));
  });
});
