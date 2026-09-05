import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { inventoryWorkspaceRoot } from "../scanners/inventory";

suite("monorepo inventory", () => {
  test("nested package.json without lock is inventoried", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "inv-mono-"));
    const app = path.join(root, "packages", "app");
    fs.mkdirSync(app, { recursive: true });
    fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({ dependencies: { lodash: "4.17.21" } }), "utf8");
    const items = inventoryWorkspaceRoot(root);
    const lodash = items.find((i) => i.packageName === "lodash");
    assert.ok(lodash);
    assert.match(lodash!.path.replace(/\\/g, "/"), /packages\/app\/package\.json$/);
    assert.ok(items.some((i) => i.kind === "coverage" && i.ecosystem === "npm" && i.path === lodash!.path));
  });

  test("nested lockfile wins over sibling package.json", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "inv-nestlock-"));
    const app = path.join(root, "packages", "app");
    fs.mkdirSync(app, { recursive: true });
    fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({ dependencies: { lodash: "^4.17.21" } }), "utf8");
    fs.writeFileSync(
      path.join(app, "package-lock.json"),
      JSON.stringify({
        packages: {
          "": { version: "1.0.0" },
          "node_modules/express": { version: "4.18.2" },
        },
      }),
      "utf8",
    );
    const items = inventoryWorkspaceRoot(root);
    assert.ok(items.some((i) => i.packageName === "express" && i.path.endsWith("package-lock.json")));
    assert.ok(!items.some((i) => i.packageName === "lodash"));
    assert.ok(!items.some((i) => i.kind === "coverage" && i.path.includes("package.json")));
  });

  test("skips node_modules package.json", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "inv-nm-"));
    fs.mkdirSync(path.join(root, "node_modules", "evil"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "node_modules", "evil", "package.json"),
      JSON.stringify({ dependencies: { evil: "1.0.0" } }),
      "utf8",
    );
    const items = inventoryWorkspaceRoot(root);
    assert.ok(!items.some((i) => i.packageName === "evil"));
  });

  test("two nested apps with same pin keep distinct keys", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "inv-dup-"));
    for (const name of ["a", "b"]) {
      const dir = path.join(root, "packages", name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ dependencies: { lodash: "4.17.21" } }), "utf8");
    }
    const items = inventoryWorkspaceRoot(root);
    const lodashes = items.filter((i) => i.packageName === "lodash");
    assert.strictEqual(lodashes.length, 2);
    assert.notStrictEqual(lodashes[0].key, lodashes[1].key);
    const notes = items.filter((i) => i.kind === "coverage" && i.ecosystem === "npm");
    assert.strictEqual(notes.length, 2);
  });
});
