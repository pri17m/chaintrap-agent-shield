import type { Finding } from "../types";

/** Payload a Cursor / VS Code hook or command can pass for one MCP tool call. */
export interface McpToolCallPayload {
  /** MCP server id from mcp.json (e.g. "filesystem"). */
  serverId?: string;
  /** Package name inferred for the server (npm/pypi/etc.). */
  packageName?: string;
  /** Tool name the agent is about to invoke. */
  toolName?: string;
  /** Tool description text (tool-poisoning / prompt-injection surface). */
  toolDescription?: string;
  /** Optional short argument preview — never logged in full by the guard. */
  argumentsPreview?: string;
}

export type GuardDecision = "block" | "warn" | "allow";

export interface GuardResult {
  decision: GuardDecision;
  reason: string;
  matchedFindingId?: string;
  heuristic?: string;
}

/** Words that, shortly before a match, mean the text is describing/prohibiting the behavior ("never leak tokens"). */
const NEGATION_RE = /\b(never|not|no|don'?t|doesn'?t|won'?t|cannot|can'?t|prevent|prevents|preventing|avoid|avoids|avoiding|without|stop|stops|protect|protects|protecting\s+against|against)\b[^.\n,;:!?]{0,30}$/i;

interface Heuristic {
  id: string;
  label: string;
  /** Global regex; every match is checked. */
  re: RegExp;
  /** When true, a match preceded by a negation word within the same clause is ignored. */
  negatable?: boolean;
}

/**
 * Lightweight local patterns for tool-description poisoning / prompt injection.
 * Advisory only in v1 — never a hard block by themselves.
 */
const TOOL_HEURISTICS: Heuristic[] = [
  {
    id: "ignore-previous",
    label: "ignore-previous-instructions",
    re: /\b(ignore|disregard)\s+(all\s+|the\s+|any\s+|your\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules|directions)/gi,
  },
  {
    id: "exfil",
    label: "exfil-language",
    re: /\b(exfiltrat\w*|send\s+(to|the)\s+(http|https|attacker)|upload\s+secrets|leak\s+(credentials|tokens|keys))\b/gi,
    negatable: true,
  },
  {
    id: "hidden-instruction",
    label: "hidden-instruction",
    // Deliberately narrow: "always call this tool" alone is common in benign docs. Flag only
    // instructions that try to hijack tool ordering or hide behavior from the user.
    re: /\b(before|prior\s+to)\s+(using|calling|invoking|running)\s+(any|every|all)\s+(other\s+)?tools?\b|\b(do\s+not|don'?t)\s+(tell|inform|mention\s+(this\s+)?to|alert)\s+the\s+user\b|\b(secretly|silently)\s+(call|invoke|run|send|read)\b/gi,
  },
  {
    id: "jailbreak",
    label: "jailbreak-language",
    // "developer mode" alone is a common benign phrase; keep only unambiguous jailbreak terms.
    re: /\b(jailbreak(?:ing|ed)?|dan\s+mode|bypass\s+(?:all\s+)?safety)\b/gi,
    negatable: true,
  },
];

const BASE64_RUN_RE = /[A-Za-z0-9+/=]{80,}/g;

/**
 * Long base64-looking blob. Excludes file paths, URLs (slash-dense), hex digests, and
 * low-entropy runs (e.g. repeated characters).
 */
function hasBase64Blob(text: string): boolean {
  for (const m of text.matchAll(BASE64_RUN_RE)) {
    const run = m[0];
    // Slash-separated tokens: paths/URLs have a slash every ~10 chars; real base64 ~1 in 64.
    const slashes = (run.match(/\//g) || []).length;
    if (slashes > 0 && slashes / run.length > 0.03) {
      continue;
    }
    if (/^[0-9a-fA-F]+$/.test(run)) {
      continue;
    }
    if (!/[A-Z]/.test(run) || !/[a-z]/.test(run)) {
      continue;
    }
    if (new Set(run).size < 12) {
      continue;
    }
    return true;
  }
  return false;
}

function norm(s: string | undefined): string {
  return (s || "").trim().toLowerCase();
}

/** Package name for matching: lower-case, ecosystem prefix ("npm:") and trailing "@version" removed. */
function normPkg(s: string | undefined): string {
  let n = norm(s).replace(/^(npm|pypi|pip|uvx|npx|cargo|go|gem|nuget):/, "");
  const at = n.lastIndexOf("@");
  if (at > 0) {
    n = n.slice(0, at);
  }
  return n;
}

/** Strip zero-width / BOM characters and apply NFKC so obfuscated phrases still match heuristics. */
function normText(s: string): string {
  return s.replace(/[\u200B-\u200F\u2060\u00AD\uFEFF]/g, "").normalize("NFKC");
}

function matchMcpFinding(findings: Finding[], payload: McpToolCallPayload): Finding | undefined {
  const pkg = normPkg(payload.packageName);
  const sid = norm(payload.serverId);
  if (!pkg && !sid) {
    return undefined;
  }
  return findings.find((f) => {
    if (f.surface !== "mcp") {
      return false;
    }
    if (pkg && f.packageName && normPkg(f.packageName) === pkg) {
      return true;
    }
    if (sid && f.mcpId && norm(f.mcpId) === sid) {
      return true;
    }
    return false;
  });
}

function heuristicHit(payload: McpToolCallPayload): { id: string; label: string } | undefined {
  const text = normText(`${payload.toolName || ""}\n${payload.toolDescription || ""}\n${payload.argumentsPreview || ""}`);
  if (!text.trim()) {
    return undefined;
  }
  for (const h of TOOL_HEURISTICS) {
    for (const m of text.matchAll(h.re)) {
      if (h.negatable) {
        const before = text.slice(Math.max(0, (m.index ?? 0) - 60), m.index ?? 0);
        if (NEGATION_RE.test(before)) {
          continue;
        }
      }
      return { id: h.id, label: h.label };
    }
  }
  if (hasBase64Blob(text)) {
    return { id: "base64-blob", label: "long-base64-blob" };
  }
  return undefined;
}

/**
 * Local, offline decision for one MCP tool call.
 * - Hard-block only when the matched MCP pin is marked malicious.
 * - Warn on high/critical vulnerable pins and on tool-description heuristics.
 * - Fail open (allow) when there is nothing to match or decide.
 */
export function evaluateMcpToolCall(findings: Finding[], payload: McpToolCallPayload | undefined | null): GuardResult {
  if (!payload || (!payload.serverId && !payload.packageName && !payload.toolName && !payload.toolDescription)) {
    return { decision: "allow", reason: "No payload — fail open." };
  }

  const matched = matchMcpFinding(findings, payload);
  const heuristic = heuristicHit(payload);

  if (matched?.malicious) {
    return {
      decision: "block",
      reason: `MCP server pin is marked malicious (${matched.packageName || matched.mcpId || "unknown"}).`,
      matchedFindingId: matched.id,
      heuristic: heuristic?.label,
    };
  }

  if (matched && (matched.severity === "critical" || matched.severity === "high")) {
    return {
      decision: "warn",
      reason: `MCP server pin has ${matched.severity} finding (${matched.title}).`,
      matchedFindingId: matched.id,
      heuristic: heuristic?.label,
    };
  }

  if (heuristic) {
    return {
      decision: "warn",
      reason: `Tool description matched heuristic "${heuristic.label}".`,
      heuristic: heuristic.label,
      matchedFindingId: matched?.id,
    };
  }

  return {
    decision: "allow",
    reason: matched ? "MCP pin has no blocking finding." : "No matching MCP finding and no heuristic hit — fail open.",
    matchedFindingId: matched?.id,
  };
}
