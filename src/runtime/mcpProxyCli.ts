#!/usr/bin/env node
/**
 * STDIO MCP proxy entrypoint.
 * Usage: node out/runtime/mcpProxyCli.js <command> [args...]
 * Env: CHAINTRAP_FINDINGS_PATH, CHAINTRAP_SERVER_ID, CHAINTRAP_PACKAGE_NAME
 */
import { runProxyFromArgv } from "./mcpProxy";

runProxyFromArgv(process.argv.slice(2));
