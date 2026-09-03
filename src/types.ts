export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type FindingSource = "baseline" | "delta";
export type Surface = "mcp" | "package" | "skill" | "rule" | "extension";
export type Ecosystem = "npm" | "pypi";

export interface InventoryItem {
  key: string;
  kind: "package" | "mcp" | "skill" | "rule";
  path: string;
  hash: string;
  workspaceRoot?: string;
  packageName?: string;
  version?: string;
  ecosystem?: Ecosystem;
  mcpId?: string;
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
  advisoryUrl?: string;
  acknowledged: boolean;
  workspaceRoot?: string;
  createdAt: string;
  unverifiedOnline?: boolean;
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
