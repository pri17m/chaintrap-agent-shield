import { createInterface } from "node:readline";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";

import { evaluateMcpToolCall, scanToolDefinition, type GuardResult, type McpToolCallPayload } from "./mcpToolGuard";
import type { Finding } from "../types";

export interface ProxyOptions {
  /** Command + args of the real MCP server (STDIO). */
  command: string;
  args: string[];
  /** Optional MCP server id for finding match. */
  serverId?: string;
  /** Optional package name for finding match. */
  packageName?: string;
  findings?: Finding[];
  /** When true, warn decisions are logged to stderr but still forwarded. */
  logWarnings?: boolean;
}

export interface ProxyHandle {
  child: ChildProcess;
  /** Process one inbound JSON-RPC line. Returns the line to forward, or a block response line. */
  onClientLine(line: string): { forward: boolean; response?: string };
  close(): void;
}

/** Load exported findings. Fails open (returns []) but reports why on stderr via `onError`. */
export function loadFindings(path: string | undefined, onError?: (msg: string) => void): Finding[] {
  if (!path) {
    return [];
  }
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      onError?.(`findings file is not a JSON array: ${path}`);
      return [];
    }
    return parsed as Finding[];
  } catch (e) {
    onError?.(`could not load findings (${path}): ${e instanceof Error ? e.message : String(e)} — guard is failing open`);
    return [];
  }
}

/** Build a guard payload from a JSON-RPC tools/call message. */
export function payloadFromRpc(msg: Record<string, unknown>, opts: Pick<ProxyOptions, "serverId" | "packageName">): McpToolCallPayload {
  const params = (msg.params && typeof msg.params === "object" ? msg.params : {}) as Record<string, unknown>;
  const toolName = typeof params.name === "string" ? params.name : undefined;
  const args = params.arguments;
  const argumentsPreview = args == null ? undefined : JSON.stringify(args).slice(0, 500);
  const toolDescription = typeof params.description === "string" ? params.description : undefined;
  return {
    serverId: opts.serverId,
    packageName: opts.packageName,
    toolName,
    toolDescription,
    argumentsPreview,
  };
}

/** Tools whose definitions (from tools/list responses) matched a heuristic: tool name -> heuristic label. */
export type FlaggedTools = Map<string, string>;

/**
 * Inspect one line from the child's stdout. If it is a tools/list result, scan each tool's
 * name and description and record flagged tools. Never throws; unparsable lines are ignored.
 * Returns newly flagged tools as [name, label] pairs.
 */
export function inspectServerLine(line: string, flagged: FlaggedTools): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  try {
    const trimmed = line.trim();
    if (!trimmed || trimmed[0] !== "{" && trimmed[0] !== "[") {
      return out;
    }
    const parsed = JSON.parse(trimmed) as unknown;
    const msgs = Array.isArray(parsed) ? parsed : [parsed];
    for (const m of msgs) {
      if (!isObject(m) || !isObject(m.result) || !Array.isArray(m.result.tools)) {
        continue;
      }
      for (const t of m.result.tools) {
        if (!isObject(t) || typeof t.name !== "string") {
          continue;
        }
        const desc = typeof t.description === "string" ? t.description : undefined;
        const hit = scanToolDefinition(t.name, desc);
        if (hit && flagged.get(t.name) !== hit.label) {
          flagged.set(t.name, hit.label);
          out.push([t.name, hit.label]);
        }
      }
    }
  } catch {
    /* fail open */
  }
  return out;
}

/** Upgrade an allow to warn when the called tool was flagged in an earlier tools/list. Block stays block. */
function applyFlagged(result: GuardResult, toolName: unknown, flagged: FlaggedTools | undefined): GuardResult {
  if (result.decision !== "allow" || typeof toolName !== "string") {
    return result;
  }
  const label = flagged?.get(toolName);
  if (!label) {
    return result;
  }
  return {
    decision: "warn",
    reason: `Tool "${toolName}" was flagged in tools/list (${label}).`,
    heuristic: label,
    matchedFindingId: result.matchedFindingId,
  };
}

function toolNameOf(msg: Record<string, unknown>): unknown {
  return isObject(msg.params) ? msg.params.name : undefined;
}

function blockResponse(id: unknown, reason: string): Record<string, unknown> {
  return { jsonrpc: "2.0", id: id ?? null, error: { code: -32000, message: `Chaintrap blocked MCP tool call: ${reason}` } };
}

export interface ClientLineDecision {
  forward: boolean;
  response?: string;
  /** Most relevant guard result (first block, else first warn, else first result). */
  result?: GuardResult;
  /** All guard results for the line (one per tools/call; several for a JSON-RPC batch). */
  results?: GuardResult[];
}

/** Decide whether a single client line should be forwarded or replaced with a JSON-RPC error. */
export function evaluateClientLine(
  line: string,
  findings: Finding[],
  opts: Pick<ProxyOptions, "serverId" | "packageName">,
  flagged?: FlaggedTools,
): ClientLineDecision {
  const trimmed = line.trim();
  if (!trimmed) {
    return { forward: true };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { forward: true };
  }

  // JSON-RPC batch: evaluate every element; if any tools/call is blocked, reject the whole batch
  // (nothing is forwarded) with an error response for each request that carried an id.
  if (Array.isArray(parsed)) {
    const results: GuardResult[] = [];
    let blocked: GuardResult | undefined;
    for (const el of parsed) {
      if (!isObject(el) || el.method !== "tools/call") {
        continue;
      }
      const r = applyFlagged(evaluateMcpToolCall(findings, payloadFromRpc(el, opts)), toolNameOf(el), flagged);
      results.push(r);
      if (r.decision === "block" && !blocked) {
        blocked = r;
      }
    }
    const pick = blocked ?? results.find((r) => r.decision === "warn") ?? results[0];
    if (!blocked) {
      return { forward: true, result: pick, results };
    }
    const errors: Array<Record<string, unknown>> = [];
    for (const el of parsed) {
      if (!isObject(el) || !("id" in el) || el.id === undefined) {
        continue; // notifications get no response
      }
      if (el.method === "tools/call") {
        const r = evaluateMcpToolCall(findings, payloadFromRpc(el, opts));
        errors.push(blockResponse(el.id, r.decision === "block" ? r.reason : `batch rejected because another call was blocked (${blocked.reason})`));
      } else {
        errors.push(blockResponse(el.id, `batch rejected because a tools/call in it was blocked (${blocked.reason})`));
      }
    }
    return { forward: false, response: errors.length ? JSON.stringify(errors) : undefined, result: blocked, results };
  }

  if (!isObject(parsed) || parsed.method !== "tools/call") {
    return { forward: true };
  }
  const msg = parsed;
  const result = applyFlagged(evaluateMcpToolCall(findings, payloadFromRpc(msg, opts)), toolNameOf(msg), flagged);
  if (result.decision !== "block") {
    return { forward: true, result, results: [result] };
  }
  return { forward: false, response: JSON.stringify(blockResponse(msg.id, result.reason)), result, results: [result] };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * STDIO MCP proxy: client stdin → policy → real server stdin;
 * real server stdout → client stdout.
 * Blocked tools/call never reach the real server.
 */
export function startStdioProxy(options: ProxyOptions): ProxyHandle {
  const findings = options.findings ?? [];
  const child = spawn(options.command, options.args, {
    stdio: ["pipe", "pipe", "inherit"],
  });

  const flaggedTools: FlaggedTools = new Map();
  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    const decided = evaluateClientLine(line, findings, options, flaggedTools);
    const log = options.logWarnings !== false;
    if (!decided.forward) {
      // A blocked batch made of notifications only has nothing to answer, but is still never forwarded.
      if (decided.response) {
        process.stdout.write(decided.response + "\n");
      }
      if (log) {
        process.stderr.write(`[chaintrap-proxy] block ${decided.result?.reason || ""}\n`);
      }
      return;
    }
    if (log) {
      for (const r of decided.results ?? (decided.result ? [decided.result] : [])) {
        if (r.decision === "warn") {
          process.stderr.write(`[chaintrap-proxy] warn ${r.reason}\n`);
        }
      }
    }
    child.stdin.write(line + "\n");
  });

  // Client closed stdin: let the child finish its input and exit instead of lingering.
  rl.on("close", () => {
    child.stdin.end();
  });
  child.on("error", (e) => {
    process.stderr.write(`[chaintrap-proxy] failed to start server: ${e.message}\n`);
    process.exit(1);
  });
  child.on("close", (code) => {
    process.exit(code ?? 0);
  });

  // Forward child output untouched; separately line-buffer a copy to inspect tools/list responses.
  const childLines = createInterface({ input: child.stdout });
  childLines.on("line", (line) => {
    for (const [name, label] of inspectServerLine(line, flaggedTools)) {
      if (options.logWarnings !== false) {
        process.stderr.write(`[chaintrap-proxy] warn tools/list: tool "${name}" description/name matched heuristic "${label}"\n`);
      }
    }
  });
  child.stdout.on("data", (d: Buffer) => {
    process.stdout.write(d);
  });

  const close = () => {
    rl.close();
    child.kill();
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);

  return {
    child,
    onClientLine(line: string) {
      return evaluateClientLine(line, findings, options, flaggedTools);
    },
    close,
  };
}

/** CLI entry: node mcpProxy.js <command> [args...] with env CHAINTRAP_FINDINGS_PATH, CHAINTRAP_SERVER_ID, CHAINTRAP_PACKAGE_NAME. */
export function runProxyFromArgv(argv: string[]): void {
  const command = argv[0];
  if (!command) {
    process.stderr.write("usage: chaintrap-mcp-proxy <command> [args...]\n");
    process.exit(2);
  }
  const findings = loadFindings(process.env.CHAINTRAP_FINDINGS_PATH, (m) => process.stderr.write(`[chaintrap-proxy] ${m}\n`));
  startStdioProxy({
    command,
    args: argv.slice(1),
    serverId: process.env.CHAINTRAP_SERVER_ID,
    packageName: process.env.CHAINTRAP_PACKAGE_NAME,
    findings,
  });
}
