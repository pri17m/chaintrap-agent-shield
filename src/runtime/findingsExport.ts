import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { Finding } from "../types";

export interface ExportResult {
  ok: boolean;
  error?: string;
}

/** Write findings for the STDIO proxy. Never throws; returns the failure so callers can surface it. */
export function writeFindingsExport(path: string, findings: Finding[]): ExportResult {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(findings), "utf8");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
