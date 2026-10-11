import { createInterface } from "node:readline";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";

import { evaluateMcpToolCall, type GuardResult, type McpToolCallPayload } from "./mcpToolGuard";
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

function loadFindings(path: string | undefined): Finding[] {
  if (!path) {
    return [];
  }
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Finding[]) : [];
  } catch {
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

/** Decide whether a single client line should be forwarded or replaced with a JSON-RPC error. */
export function evaluateClientLine(
  line: string,
  findings: Finding[],
  opts: Pick<ProxyOptions, "serverId" | "packageName">,
): { forward: boolean; response?: string; result?: GuardResult } {
  const trimmed = line.trim();
  if (!trimmed) {
    return { forward: true };
  }
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return { forward: true };
  }
  if (msg.method !== "tools/call") {
    return { forward: true };
  }
  const result = evaluateMcpToolCall(findings, payloadFromRpc(msg, opts));
  if (result.decision !== "block") {
    return { forward: true, result };
  }
  const id = msg.id ?? null;
  const response = JSON.stringify({
    jsonrpc: "2.0",
    id,
    error: { code: -32000, message: `Chaintrap blocked MCP tool call: ${result.reason}` },
  });
  return { forward: false, response, result };
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

  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    const decided = evaluateClientLine(line, findings, options);
    if (!decided.forward && decided.response) {
      process.stdout.write(decided.response + "\n");
      if (options.logWarnings !== false) {
        process.stderr.write(`[chaintrap-proxy] block ${decided.result?.reason || ""}\n`);
      }
      return;
    }
    if (decided.result?.decision === "warn" && options.logWarnings !== false) {
      process.stderr.write(`[chaintrap-proxy] warn ${decided.result.reason}\n`);
    }
    child.stdin.write(line + "\n");
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
      return evaluateClientLine(line, findings, options);
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
  const findings = loadFindings(process.env.CHAINTRAP_FINDINGS_PATH);
  startStdioProxy({
    command,
    args: argv.slice(1),
    serverId: process.env.CHAINTRAP_SERVER_ID,
    packageName: process.env.CHAINTRAP_PACKAGE_NAME,
    findings,
  });
}
