import type { Finding } from "../types";

function applyAck(f: Finding, acks: Record<string, string>): Finding {
  return { ...f, acknowledged: Boolean(acks[f.id] || f.acknowledged) };
}

/** Keep findings belonging to workspace roots that are not currently open. */
export function isOutOfScopeFinding(f: Finding, openRoots: readonly string[]): boolean {
  if (!f.workspaceRoot) {
    return false; // user-level — always in scope for baseline of open window
  }
  if (openRoots.length === 0) {
    return false;
  }
  return !openRoots.some((r) => f.workspaceRoot === r);
}

/**
 * Baseline: drop in-scope prior findings; keep out-of-scope history; apply incoming with acks.
 */
export function replaceBaselineFindings(
  existing: Finding[],
  incoming: Finding[],
  acks: Record<string, string>,
  openRoots: readonly string[],
): Finding[] {
  const kept = existing.filter((f) => isOutOfScopeFinding(f, openRoots)).map((f) => applyAck(f, acks));
  const next = incoming.map((f) => applyAck(f, acks));
  const byId = new Map<string, Finding>();
  for (const f of kept) {
    byId.set(f.id, f);
  }
  for (const f of next) {
    byId.set(f.id, f);
  }
  return [...byId.values()];
}

/**
 * Delta: merge incoming; prune findings whose path is no longer in the live inventory
 * for in-scope roots (and user-level). Out-of-scope findings are preserved.
 */
export function applyDeltaFindings(
  existing: Finding[],
  incoming: Finding[],
  acks: Record<string, string>,
  livePaths: Set<string>,
  openRoots: readonly string[],
): Finding[] {
  const byId = new Map<string, Finding>();
  for (const f of existing) {
    byId.set(f.id, applyAck(f, acks));
  }
  for (const f of incoming) {
    const prev = byId.get(f.id);
    byId.set(f.id, applyAck({ ...f, acknowledged: Boolean(prev?.acknowledged || f.acknowledged) }, acks));
  }
  const out: Finding[] = [];
  for (const f of byId.values()) {
    if (isOutOfScopeFinding(f, openRoots)) {
      out.push(f);
      continue;
    }
    if (livePaths.size === 0 || livePaths.has(f.path)) {
      out.push(f);
      continue;
    }
    // Path gone from inventory — prune
  }
  return out;
}

/** Findings shown for the current window. */
export function scopeFindingsForDisplay(findings: Finding[], openRoots: readonly string[]): Finding[] {
  if (openRoots.length === 0) {
    return findings;
  }
  return findings.filter((f) => !isOutOfScopeFinding(f, openRoots) || !f.workspaceRoot);
}
