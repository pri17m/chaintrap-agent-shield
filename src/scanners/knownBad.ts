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
  updated?: string;
  npm?: Record<string, string[]>;
  pypi?: Record<string, string[]>;
  references?: Record<string, { campaign?: string; note?: string; url?: string }>;
}

let cache: KnownBadDoc | null = null;
let cachePath: string | null = null;
let lastOk: boolean = true;
let lastError: string | undefined;

export function knownBadDataPath(): string {
  return path.join(__dirname, "..", "..", "data", "known_bad_packages.json");
}

export function loadKnownBad(dataPath?: string): KnownBadDoc {
  const p = dataPath || knownBadDataPath();
  if (cache && cachePath === p) {
    return cache;
  }
  try {
    const raw = fs.readFileSync(p, "utf8");
    cache = JSON.parse(raw) as KnownBadDoc;
    cachePath = p;
    lastOk = true;
    lastError = undefined;
    return cache;
  } catch (err) {
    lastOk = false;
    lastError = String(err);
    cache = { version: 1, npm: {}, pypi: {}, references: {} };
    cachePath = p;
    return cache;
  }
}

export function clearKnownBadCache(): void {
  cache = null;
  cachePath = null;
  lastOk = true;
  lastError = undefined;
}

export function knownBadHealth(dataPath?: string): { ok: boolean; path: string; updated?: string; error?: string } {
  const doc = loadKnownBad(dataPath);
  const p = dataPath || cachePath || knownBadDataPath();
  return { ok: lastOk, path: p, updated: doc.updated, error: lastOk ? undefined : lastError || "load_failed" };
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
