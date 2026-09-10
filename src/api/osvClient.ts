export const OSV_QUERYBATCH_URL = "https://api.osv.dev/v1/querybatch";
export const OSV_VULN_URL = "https://api.osv.dev/v1/vulns";

import { osvEcosystemName } from "../scanners/ecosystems";
import type { Ecosystem, OsvQuery, OsvVuln } from "../types";

function osvEcosystem(eco: Ecosystem): string {
  return osvEcosystemName(eco);
}

export function pickPrimaryOsvId(ids: string[]): string | undefined {
  return ids.find((id) => id.startsWith("MAL-")) || ids.find((id) => id.startsWith("GHSA-")) || ids[0];
}

export function classifyOsvIds(vulns: OsvVuln[]): {
  severity: "critical" | "high" | "medium" | "low" | "info";
  ids: string[];
  advisoryUrl?: string;
  malicious: boolean;
} {
  const ids = vulns.map((v) => v.id).filter(Boolean);
  const primary = pickPrimaryOsvId(ids);
  if (ids.some((id) => id.startsWith("MAL-"))) {
    return {
      severity: "critical",
      ids,
      malicious: true,
      advisoryUrl: primary ? `https://osv.dev/vulnerability/${primary}` : undefined,
    };
  }
  if (ids.length === 0) {
    return { severity: "info", ids, malicious: false };
  }
  const hasHigh = vulns.some((v) =>
    (v.severity || []).some((s) => {
      const n = Number.parseFloat(s.score || "");
      return Number.isFinite(n) && n >= 7;
    }),
  );
  return {
    severity: hasHigh ? "high" : "medium",
    ids,
    malicious: false,
    advisoryUrl: primary ? `https://osv.dev/vulnerability/${primary}` : undefined,
  };
}

export async function fetchOsvSummaries(
  ids: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out: Record<string, string> = {};
  await Promise.all(
    unique.map(async (id) => {
      try {
        const resp = await fetchImpl(`${OSV_VULN_URL}/${encodeURIComponent(id)}`, {
          headers: { Accept: "application/json", "User-Agent": "chaintrap-agent-shield/0.1" },
        });
        if (!resp.ok) {
          return;
        }
        const data = (await resp.json()) as { summary?: string };
        if (data.summary?.trim()) {
          out[id] = data.summary.trim();
        }
      } catch {
        /* leave empty */
      }
    }),
  );
  return out;
}

export async function queryOsvQuerybatch(
  queries: OsvQuery[],
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; results: OsvVuln[][] }> {
  if (queries.length === 0) {
    return { ok: true, results: [] };
  }
  const results: OsvVuln[][] = [];
  let ok = true;
  const batchSize = 1000;
  for (let i = 0; i < queries.length; i += batchSize) {
    const chunk = queries.slice(i, i + batchSize);
    const body = {
      queries: chunk.map((q) => ({
        package: { name: q.name, ecosystem: osvEcosystem(q.ecosystem) },
        version: q.version,
      })),
    };
    try {
      const resp = await fetchImpl(OSV_QUERYBATCH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "chaintrap-agent-shield/0.1",
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        ok = false;
        for (let j = 0; j < chunk.length; j++) {
          results.push([]);
        }
        continue;
      }
      const data = (await resp.json()) as { results?: unknown };
      const rawResults = Array.isArray((data as { results?: unknown }).results)
        ? ((data as { results: unknown[] }).results as unknown[])
        : null;
      if (!rawResults) {
        ok = false;
        for (let j = 0; j < chunk.length; j++) {
          results.push([]);
        }
        continue;
      }
      if (rawResults.length !== chunk.length) {
        ok = false;
      }
      for (let idx = 0; idx < chunk.length; idx++) {
        const row = rawResults[idx] as { vulns?: unknown } | undefined;
        const list =
          row && typeof row === "object" && Array.isArray((row as { vulns?: unknown }).vulns)
            ? ((row as { vulns: unknown[] }).vulns as unknown[])
            : [];
        const vulns = list.filter((v) => v && typeof v === "object") as OsvVuln[];
        results.push(vulns);
      }
    } catch {
      ok = false;
      for (let j = 0; j < chunk.length; j++) {
        results.push([]);
      }
    }
  }
  return { ok, results };
}
