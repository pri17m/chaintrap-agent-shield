import * as fs from "fs";
import * as path from "path";
import type { Ecosystem } from "../types";

export interface KnownBadHit {
  campaign: string;
  note: string;
  message: string;
}

interface KnownBadDoc {
  version?: number;
  npm?: Record<string, string[]>;
  pypi?: Record<string, string[]>;
  references?: Record<string, { campaign?: string; note?: string; url?: string }>;
}

let cache: KnownBadDoc | null = null;

export function knownBadDataPath(): string {
  return path.join(__dirname, "..", "..", "data", "known_bad_packages.json");
}

export function loadKnownBad(dataPath?: string): KnownBadDoc {
  if (cache) {
    return cache;
  }
  const p = dataPath || knownBadDataPath();
  try {
    const raw = fs.readFileSync(p, "utf8");
    cache = JSON.parse(raw) as KnownBadDoc;
    return cache;
  } catch {
    cache = { version: 1, npm: {}, pypi: {}, references: {} };
    return cache;
  }
}

export function clearKnownBadCache(): void {
  cache = null;
}

export function matchKnownBad(
  ecosystem: Ecosystem,
  name: string,
  version: string,
  dataPath?: string,
): KnownBadHit | null {
  const eco = ecosystem.trim().toLowerCase() as Ecosystem;
  const pkgName = name.trim();
  const ver = version.trim();
  if (!eco || !pkgName || !ver || ver === "unknown") {
    return null;
  }
  const doc = loadKnownBad(dataPath);
  const ecoMap = eco === "pypi" ? doc.pypi : eco === "npm" ? doc.npm : undefined;
  const versions = ecoMap?.[pkgName];
  if (!Array.isArray(versions) || !versions.includes(ver)) {
    return null;
  }
  const refs = doc.references || {};
  const ref = refs[`${eco}:${pkgName}@${ver}`] || refs[`${eco}:${pkgName}`] || {};
  const campaign = ref.campaign || "";
  const note = ref.note || ref.url || "";
  let message = `Known-bad package on denylist: ${pkgName}@${ver}`;
  if (campaign) {
    message += ` (${campaign})`;
  }
  return { campaign, note, message };
}
