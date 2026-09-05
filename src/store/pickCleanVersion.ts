import { classifyOsvIds, queryOsvQuerybatch } from "../api/osvClient";
import { fetchPublishedVersions } from "../api/registryVersion";
import { compareSemver, satisfiesRange } from "../scanners/pinSpec";
import type { Ecosystem } from "../types";
import { matchKnownBad } from "../scanners/knownBad";

const CANDIDATE_CAP = 20;

export async function pickCleanVersion(
  opts: {
    ecosystem: Ecosystem;
    name: string;
    spec: string;
    fetchImpl?: typeof fetch;
  },
): Promise<{ version?: string; reason?: string }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const published = await fetchPublishedVersions(opts.ecosystem, opts.name, fetchImpl);
  if (!published) {
    return { reason: "registry unreachable" };
  }
  const candidates = published.filter((v) => satisfiesRange(opts.spec, v)).sort((a, b) => compareSemver(b, a));
  if (candidates.length === 0) {
    return { reason: "no published version in range" };
  }
  const top = candidates.slice(0, CANDIDATE_CAP);
  let osvOk = true;
  let osvResults: Awaited<ReturnType<typeof queryOsvQuerybatch>>["results"] = [];
  try {
    const batch = await queryOsvQuerybatch(
      top.map((version) => ({ ecosystem: opts.ecosystem, name: opts.name, version })),
      fetchImpl,
    );
    osvOk = batch.ok;
    osvResults = batch.results;
  } catch {
    osvOk = false;
  }
  if (!osvOk) {
    return { reason: "OSV unreachable" };
  }
  for (let i = 0; i < top.length; i++) {
    const version = top[i];
    if (matchKnownBad(opts.ecosystem, opts.name, version)) {
      continue;
    }
    const cls = classifyOsvIds(osvResults[i] || []);
    if (cls.malicious || cls.severity !== "info") {
      continue;
    }
    return { version };
  }
  return { reason: "no clean version in range" };
}
