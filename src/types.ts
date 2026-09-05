export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type FindingSource = "baseline" | "delta";
export type Surface = "mcp" | "package" | "skill" | "rule" | "extension";
export type Ecosystem = "npm" | "pypi";

export interface InventoryItem {
  key: string;
  kind: "package" | "mcp" | "skill" | "rule" | "coverage";
  path: string;
  hash: string;
  workspaceRoot?: string;
  packageName?: string;
  version?: string;
  ecosystem?: Ecosystem;
  mcpId?: string;
  /** False when the manifest spec is a range, tag, or URL — not an OSV-exact pin. */
  pinExact?: boolean;
  /** Original manifest spec when pinExact is false (e.g. ^4.17.21). */
  spec?: string;
  coverageKind?: "no-lockfile" | "not-exact";
  /** Ephemeral UTF-8 body for the current scan pass — never persist. */
  content?: string;
}

export interface Finding {
  id: string;
  source: FindingSource;
  surface: Surface;
  severity: Severity;
  title: string;
  message: string;
  path: string;
  packageName?: string;
  version?: string;
  ecosystem?: Ecosystem;
  osvIds?: string[];
  summary?: string;
  advisoryUrl?: string;
  acknowledged: boolean;
  workspaceRoot?: string;
  createdAt: string;
  unverifiedOnline?: boolean;
  /** True for known-bad or OSV MAL-*. False/undefined for CVE-only or informational. */
  malicious?: boolean;
  /** Informational: only direct pins are checked because no lockfile is present. */
  coverageNote?: boolean;
  coverageKind?: "no-lockfile" | "not-exact";
  /** Original range/tag spec when the pin is not exact. */
  spec?: string;
  /** MCP server id from mcp.json when surface is mcp. */
  mcpId?: string;
}

export interface BaselineSnapshot {
  workspaceRoot: string;
  scannedAt: string;
  items: Record<string, InventoryItem>;
}

export interface OsvQuery {
  ecosystem: Ecosystem;
  name: string;
  version: string;
}

export interface OsvVuln {
  id: string;
  summary?: string;
  severity?: Array<{ type?: string; score?: string }>;
}
