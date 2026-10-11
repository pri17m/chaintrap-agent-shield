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

/**
 * Lightweight local patterns for tool-description poisoning / prompt injection.
 * Advisory only in v1 — never a hard block by themselves.
 */
const TOOL_HEURISTICS: Array<{ id: string; re: RegExp; label: string }> = [
  { id: "ignore-previous", re: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i, label: "ignore-previous-instructions" },
  { id: "exfil", re: /\b(exfiltrat|send\s+(to|the)\s+(http|https|attacker)|upload\s+secrets|leak\s+(credentials|tokens|keys))\b/i, label: "exfil-language" },
  { id: "hidden-instruction", re: /\b(you\s+must|always)\s+(call|invoke|run)\s+this\s+tool\b/i, label: "hidden-instruction" },
  { id: "jailbreak", re: /\b(jailbreak|developer\s+mode|dan\s+mode|bypass\s+safety)\b/i, label: "jailbreak-language" },
  { id: "base64-blob", re: /\b[A-Za-z0-9+/]{80,}={0,2}\b/, label: "long-base64-blob" },
];

function norm(s: string | undefined): string {
  return (s || "").trim().toLowerCase();
}

function matchMcpFinding(findings: Finding[], payload: McpToolCallPayload): Finding | undefined {
  const pkg = norm(payload.packageName);
  const sid = norm(payload.serverId);
  if (!pkg && !sid) {
    return undefined;
  }
  return findings.find((f) => {
    if (f.surface !== "mcp") {
      return false;
    }
    if (pkg && f.packageName && norm(f.packageName) === pkg) {
      return true;
    }
    if (sid && f.mcpId && norm(f.mcpId) === sid) {
      return true;
    }
    return false;
  });
}

function heuristicHit(payload: McpToolCallPayload): { id: string; label: string } | undefined {
  const text = `${payload.toolName || ""}\n${payload.toolDescription || ""}\n${payload.argumentsPreview || ""}`;
  if (!text.trim()) {
    return undefined;
  }
  for (const h of TOOL_HEURISTICS) {
    if (h.re.test(text)) {
      return { id: h.id, label: h.label };
    }
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
