import type { Ecosystem } from "../types";

export interface McpServerEntry {
  id: string;
  command: string;
  args: unknown[];
  url?: string | null;
}

export interface InferredPackage {
  ecosystem: Ecosystem;
  name: string;
  version: string;
}

function coerceMcpArgsList(argsRaw: unknown): unknown[] {
  if (argsRaw == null) {
    return [];
  }
  if (Array.isArray(argsRaw)) {
    return argsRaw;
  }
  if (typeof argsRaw === "string") {
    const s = argsRaw.trim();
    if (!s) {
      return [];
    }
    if (s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s) as unknown;
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        /* fall through */
      }
    }
    return [s];
  }
  return [argsRaw];
}

function invokerLine(command: string, argsList: unknown[]): string {
  const parts: string[] = [];
  const c = (command || "").trim();
  if (c) {
    parts.push(c);
  }
  for (const a of argsList) {
    parts.push(String(a).trim());
  }
  return parts.join(" ").toLowerCase();
}

function lineImpliesNpmTool(line: string): boolean {
  return ["npx", "npm", "pnpm", "yarn", "bunx"].some((x) => line.includes(x));
}

function lineImpliesUvx(line: string): boolean {
  return line.includes("uvx");
}

function isNpmInvokerToken(t: string): boolean {
  const base = t.replace(/\\/g, "/").split("/").pop() || t;
  return /^(npx|npm|pnpm|yarn|bunx)(\.cmd|\.exe)?$/i.test(base);
}

function parseNpmPackageSpec(cand: string): [string, string] | null {
  if (!cand || cand === "." || cand.startsWith("-") || isNpmInvokerToken(cand)) {
    return null;
  }
  if (cand.includes("\\") || /^[A-Za-z]:/.test(cand) || (cand.includes("/") && !cand.startsWith("@"))) {
    return null;
  }
  if (cand.startsWith("@")) {
    const m = cand.match(/^(@[^@/]+\/[^@/]+)(?:@(.+))?$/);
    if (!m) {
      return null;
    }
    return [m[1].trim().toLowerCase(), (m[2] || "").trim() || "unknown"];
  }
  const at = cand.indexOf("@");
  if (at > 0) {
    const name = cand.slice(0, at).trim().toLowerCase();
    const ver = cand.slice(at + 1).trim() || "unknown";
    return /^[a-z0-9._-]+$/.test(name) ? [name, ver] : null;
  }
  return /^[A-Za-z0-9._-]+$/.test(cand) ? [cand.toLowerCase(), "unknown"] : null;
}

function splitPypiSpecFromArgs(args: unknown[]): [string, string] | null {
  const tokens = args.map((a) => (typeof a === "string" ? a.trim() : String(a))).filter((t) => t && !t.startsWith("-"));
  for (const cand of tokens) {
    if (["uvx", "pipx", "run", "exec"].includes(cand.toLowerCase())) {
      continue;
    }
    const eq = cand.match(/^([A-Za-z0-9_.-]+)==(.+)$/);
    if (eq) {
      return [eq[1].toLowerCase().replace(/_/g, "-"), eq[2].trim() || "unknown"];
    }
    return [cand.toLowerCase().replace(/_/g, "-"), "unknown"];
  }
  return null;
}

function lineImpliesPipx(line: string): boolean {
  return line.includes("pipx");
}

function lineImpliesGo(line: string): boolean {
  return /\bgo(\.exe)?\b/.test(line) && /\b(run|install)\b/.test(line);
}

function lineImpliesCargo(line: string): boolean {
  return line.includes("cargo");
}

function tokenBase(t: string): string {
  return t.replace(/\\/g, "/").split("/").pop() || t;
}

function inferGoSpec(args: unknown[]): [string, string] | null {
  for (const a of args) {
    const cand = String(a).trim();
    if (!cand || cand.startsWith("-")) {
      continue;
    }
    if (!cand.includes(".") && !cand.includes("/")) {
      continue;
    }
    const at = cand.lastIndexOf("@");
    if (at > 0) {
      return [cand.slice(0, at), cand.slice(at + 1) || "unknown"];
    }
    if (cand.startsWith("github.com/") || cand.startsWith("golang.org/") || cand.startsWith("gopkg.in/")) {
      return [cand, "unknown"];
    }
  }
  return null;
}

function inferCargoSpec(args: unknown[]): [string, string] | null {
  const tokens = args.map((a) => String(a).trim());
  let version = "unknown";
  for (let i = 0; i < tokens.length; i++) {
    if ((tokens[i] === "--version" || tokens[i] === "-V") && tokens[i + 1]) {
      version = tokens[i + 1];
    }
  }
  for (const t of tokens) {
    if (t.startsWith("-") || t === "install" || t === "run" || t === "cargo") {
      continue;
    }
    const at = t.lastIndexOf("@");
    if (at > 0) {
      return [t.slice(0, at), t.slice(at + 1) || version];
    }
    if (/^[A-Za-z0-9_-]+$/.test(t)) {
      return [t, version];
    }
  }
  return null;
}

function inferNugetSpec(args: unknown[]): [string, string] | null {
  const tokens = args.map((a) => String(a).trim()).filter((t) => t && !t.startsWith("-"));
  for (const t of tokens) {
    if (/^(dotnet|dnx|tool|run|exec)$/i.test(tokenBase(t))) {
      continue;
    }
    const at = t.lastIndexOf("@");
    if (at > 0) {
      return [t.slice(0, at), t.slice(at + 1) || "unknown"];
    }
    return [t, "unknown"];
  }
  return null;
}

function lineImpliesPython(line: string): boolean {
  return (
    line.includes("python") ||
    line.endsWith("python.exe") ||
    line.includes("python3") ||
    line.endsWith("py.exe") ||
    line.includes("py.exe") ||
    line.includes("pipx")
  );
}

function argsImplyPythonModule(argsList: unknown[]): boolean {
  return argsList.some((a) => String(a).trim() === "-m");
}

function cleanStr(v: unknown): string {
  if (v == null) {
    return "";
  }
  return String(v).trim();
}

function normCmp(s: string): string {
  return (s || "").trim().toLowerCase().replace(/_/g, "-");
}

function splitNpmSpecFromArgs(args: unknown[]): [string, string] | null {
  const tokens = args.map((a) => (typeof a === "string" ? a.trim() : String(a)));
  const filtered: string[] = [];
  let skipNext = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (t === "-y" || t === "--yes" || t === "-yes") {
      continue;
    }
    if ((t === "-p" || t === "--package") && i + 1 < tokens.length) {
      filtered.push(tokens[i + 1]);
      skipNext = true;
      continue;
    }
    if (t.startsWith("-")) {
      continue;
    }
    filtered.push(t);
  }
  for (const cand of filtered) {
    const spec = parseNpmPackageSpec(cand);
    if (spec) {
      return spec;
    }
  }
  return null;
}

function pythonModuleFromArgs(args: unknown[]): string | null {
  const tokens = args.map((a) => cleanStr(a));
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "-m" && i + 1 < tokens.length) {
      const mod = tokens[i + 1].trim();
      if (mod) {
        return mod;
      }
    }
  }
  return null;
}

export function inferNpmPypiFromMcpRow(row: Record<string, unknown>): InferredPackage | null {
  const command = cleanStr(row.Command ?? row.command);
  const argsList = coerceMcpArgsList(row.Args !== undefined ? row.Args : row.args);
  const line = invokerLine(command, argsList);

  const mod = pythonModuleFromArgs(argsList);
  if (mod && (lineImpliesPython(line) || argsImplyPythonModule(argsList))) {
    const pypiGuess = normCmp(mod.replace(/\./g, "-"));
    if (pypiGuess) {
      return { ecosystem: "pypi", name: pypiGuess, version: "unknown" };
    }
  }

  if (lineImpliesUvx(line) || lineImpliesPipx(line)) {
    const py = splitPypiSpecFromArgs(argsList);
    if (py && py[0]) {
      return { ecosystem: "pypi", name: py[0], version: (py[1] || "").trim() ? py[1] : "unknown" };
    }
  }

  if (lineImpliesGo(line)) {
    const go = inferGoSpec(argsList);
    if (go && go[0]) {
      return { ecosystem: "go", name: go[0], version: go[1] || "unknown" };
    }
  }

  if (lineImpliesCargo(line) && /\b(install|run)\b/.test(line)) {
    const crate = inferCargoSpec(argsList);
    if (crate && crate[0]) {
      return { ecosystem: "crates", name: crate[0], version: crate[1] || "unknown" };
    }
  }

  if (/\b(dotnet|dnx)(\.exe)?\b/.test(line)) {
    const nuget = inferNugetSpec(argsList);
    if (nuget && nuget[0]) {
      return { ecosystem: "nuget", name: nuget[0], version: nuget[1] || "unknown" };
    }
  }

  const spec = splitNpmSpecFromArgs(argsList);
  if (spec && spec[0]) {
    if (lineImpliesNpmTool(line)) {
      const [nameL, ver] = spec;
      return { ecosystem: "npm", name: nameL, version: (ver || "").trim() ? ver : "unknown" };
    }
    if (
      argsList.length >= 2 &&
      ["-y", "--yes", "-yes", "-p", "--package"].includes(String(argsList[0]).trim().toLowerCase()) &&
      (spec[0].includes("@") || spec[0].includes("/"))
    ) {
      const [nameL, ver] = spec;
      return { ecosystem: "npm", name: nameL, version: (ver || "").trim() ? ver : "unknown" };
    }
  }
  return null;
}

export function parseMcpConfigJson(raw: string): McpServerEntry[] {
  let doc: unknown;
  try {
    doc = JSON.parse(raw) as unknown;
  } catch {
    return [];
  }
  if (!doc || typeof doc !== "object") {
    return [];
  }
  const obj = doc as Record<string, unknown>;
  const serversRaw =
    (obj.mcpServers as Record<string, unknown> | undefined) ||
    ((obj.mcp as Record<string, unknown> | undefined)?.servers as Record<string, unknown> | undefined);
  if (!serversRaw || typeof serversRaw !== "object") {
    return [];
  }
  const out: McpServerEntry[] = [];
  for (const [id, value] of Object.entries(serversRaw)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    const v = value as Record<string, unknown>;
    out.push({
      id,
      command: cleanStr(v.command),
      args: coerceMcpArgsList(v.args),
      url: typeof v.url === "string" ? v.url : null,
    });
  }
  return out;
}

export function inferredFromMcpServer(server: McpServerEntry): InferredPackage | null {
  return inferNpmPypiFromMcpRow({
    command: server.command,
    args: server.args,
  });
}

export function formatMcpInvocation(server: McpServerEntry): string {
  const parts: string[] = [];
  if (server.command) {
    parts.push(server.command);
  }
  for (const a of server.args) {
    const s = String(a).trim();
    if (s) {
      parts.push(s);
    }
  }
  return parts.join(" ");
}
