import type { Finding, InventoryItem } from "../types";

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

export function liveInventoryKeyForFinding(f: Finding, liveItems: readonly InventoryItem[]): string | undefined {
  const name = (f.packageName || "").toLowerCase();
  const ver = f.version || "";
  return liveItems.find((i) => {
    if (f.coverageNote) {
      return i.kind === "coverage" && i.path === f.path && i.ecosystem === f.ecosystem;
    }
    if (i.path !== f.path) {
      return false;
    }
    if ((i.packageName || "").toLowerCase() !== name || (i.version || "") !== ver) {
      return false;
    }
    if (f.surface === "mcp") {
      return i.kind === "mcp" && i.mcpId === f.mcpId;
    }
    if (f.surface === "package") {
      return i.kind === "package";
    }
    return false;
  })?.key;
}

export interface ReplaceBaselineOptions {
  /** Inventory keys skipped this pass — keep prior findings for those packages. */
  skipKeys?: Set<string>;
  liveItems?: readonly InventoryItem[];
}

/**
 * Baseline: drop in-scope prior findings; keep out-of-scope history; apply incoming with acks.
 * If skipKeys+liveItems are set, keep in-scope findings whose live inventory key was skipped.
 */
export function replaceBaselineFindings(
  existing: Finding[],
  incoming: Finding[],
  acks: Record<string, string>,
  openRoots: readonly string[],
  options?: ReplaceBaselineOptions,
): Finding[] {
  const skipKeys = options?.skipKeys;
  const liveItems = options?.liveItems;
  const kept = existing
    .filter((f) => {
      if (isOutOfScopeFinding(f, openRoots)) {
        return true;
      }
      if (!skipKeys || !liveItems) {
        return false;
      }
      const key = liveInventoryKeyForFinding(f, liveItems);
      return Boolean(key && skipKeys.has(key));
    })
    .map((f) => applyAck(f, acks));
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
  liveItems?: readonly InventoryItem[],
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
    if (f.coverageNote && liveItems) {
      const still = liveItems.some(
        (i) => i.kind === "coverage" && i.path === f.path && i.ecosystem === f.ecosystem,
      );
      if (still) {
        out.push(f);
      }
      continue;
    }
    if (liveItems && (f.surface === "mcp" || f.surface === "package") && !liveInventoryKeyForFinding(f, liveItems)) {
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

/** Only skip re-analysis when a prior finding already covers that inventory key. */
export function skipKeysCoveredByFindings(
  skipKeys: Set<string>,
  liveItems: readonly InventoryItem[],
  existing: readonly Finding[],
): Set<string> {
  const covered = new Set<string>();
  for (const f of existing) {
    const key = liveInventoryKeyForFinding(f, liveItems);
    if (key) {
      covered.add(key);
    }
  }
  const out = new Set<string>();
  for (const k of skipKeys) {
    if (covered.has(k)) {
      out.add(k);
    }
  }
  return out;
}
