#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(__dirname, "..", "data", "known_bad_packages.json");
const envSrc = process.env.CHAINTRAP_KNOWN_BAD_PATH;
const candidates = [
  envSrc,
  path.join(__dirname, "..", "..", "scan-action", "data", "known_bad_packages.json"),
  path.join(__dirname, "..", "..", "extension-analyser", "packages", "chaintrap-static-scan", "data", "known_bad_packages.json"),
].filter(Boolean);

let copied = false;
for (const src of candidates) {
  if (src && fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied known_bad intel from ${src}`);
    copied = true;
    break;
  }
}
if (!copied) {
  console.log("No source known_bad file found; leaving existing dest.");
}
