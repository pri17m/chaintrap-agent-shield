/** Surgical mcp.json edits: change one server, keep the rest of the file intact. */

export function detectJsonIndent(raw: string): string {
  const m = raw.match(/\n([\t ]+)\S/);
  return m?.[1] ?? "  ";
}

export function detectNewline(raw: string): "\r\n" | "\n" {
  return raw.includes("\r\n") ? "\r\n" : "\n";
}

export function applyJsonIndent(doc: unknown, raw: string): string {
  const indent = detectJsonIndent(raw);
  const nl = detectNewline(raw);
  let out = JSON.stringify(doc, null, indent);
  if (nl === "\r\n") {
    out = out.replace(/\n/g, "\r\n");
  }
  if (!out.endsWith(nl)) {
    out += nl;
  }
  return out;
}

interface ObjectProp {
  key: string;
  from: number;
  to: number;
}

function skipTrivia(s: string, i: number): number {
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i += 1;
      continue;
    }
    if (c === "/" && s[i + 1] === "/") {
      i += 2;
      while (i < s.length && s[i] !== "\n") {
        i += 1;
      }
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) {
        i += 1;
      }
      i = Math.min(i + 2, s.length);
      continue;
    }
    break;
  }
  return i;
}

function readJsonString(s: string, i: number): { value: string; end: number } | null {
  if (s[i] !== "\"") {
    return null;
  }
  let j = i + 1;
  while (j < s.length) {
    if (s[j] === "\\") {
      j += 2;
      continue;
    }
    if (s[j] === "\"") {
      try {
        return { value: JSON.parse(s.slice(i, j + 1)) as string, end: j + 1 };
      } catch {
        return null;
      }
    }
    j += 1;
  }
  return null;
}

function matchPair(s: string, start: number, open: string, close: string): number {
  let depth = 0;
  let i = start;
  while (i < s.length) {
    if (s[i] === "\"") {
      const str = readJsonString(s, i);
      if (!str) {
        break;
      }
      i = str.end;
      continue;
    }
    if (s[i] === open) {
      depth += 1;
    } else if (s[i] === close) {
      depth -= 1;
      if (depth === 0) {
        return i + 1;
      }
    }
    i += 1;
  }
  throw new Error("unbalanced JSON");
}

function skipValue(s: string, i: number): number {
  i = skipTrivia(s, i);
  if (s[i] === "\"") {
    const str = readJsonString(s, i);
    if (!str) {
      throw new Error("bad string");
    }
    return str.end;
  }
  if (s[i] === "{") {
    return matchPair(s, i, "{", "}");
  }
  if (s[i] === "[") {
    return matchPair(s, i, "[", "]");
  }
  while (i < s.length && !/[\s,\]\}]/.test(s[i])) {
    i += 1;
  }
  return i;
}

function objectProps(s: string, brace: number): ObjectProp[] {
  if (s[brace] !== "{") {
    throw new Error("expected object");
  }
  const props: ObjectProp[] = [];
  let i = skipTrivia(s, brace + 1);
  while (i < s.length && s[i] !== "}") {
    const from = i;
    const key = readJsonString(s, i);
    if (!key) {
      break;
    }
    i = skipTrivia(s, key.end);
    if (s[i] !== ":") {
      break;
    }
    i = skipValue(s, i + 1);
    props.push({ key: key.value, from, to: i });
    i = skipTrivia(s, i);
    if (s[i] === ",") {
      i = skipTrivia(s, i + 1);
    }
  }
  return props;
}

function topObjectBrace(raw: string): number {
  const i = skipTrivia(raw, 0);
  if (raw[i] !== "{") {
    throw new Error("mcp.json root must be an object");
  }
  return i;
}

function serversObjectBrace(raw: string): number | undefined {
  const root = objectProps(raw, topObjectBrace(raw));
  const mcpServersHits = root.filter((p) => p.key === "mcpServers");
  if (mcpServersHits.length === 1) {
    const mcpServers = mcpServersHits[0];
    const colon = raw.indexOf(":", mcpServers.from);
    if (colon < 0) {
      return undefined;
    }
    const b = skipTrivia(raw, colon + 1);
    return raw[b] === "{" ? b : undefined;
  }
  if (mcpServersHits.length > 1) {
    return undefined; // ambiguous (duplicate keys)
  }

  const mcpHits = root.filter((p) => p.key === "mcp");
  const mcp = mcpHits.length === 1 ? mcpHits[0] : undefined;
  if (!mcp) {
    return undefined;
  }
  const colon = raw.indexOf(":", mcp.from);
  if (colon < 0) {
    return undefined;
  }
  const mcpObj = skipTrivia(raw, colon + 1);
  if (raw[mcpObj] !== "{") {
    return undefined;
  }
  const inner = objectProps(raw, mcpObj);
  const serversHits = inner.filter((p) => p.key === "servers");
  const servers = serversHits.length === 1 ? serversHits[0] : undefined;
  if (!servers) {
    return undefined;
  }
  if (serversHits.length > 1) {
    return undefined;
  }
  const serversColon = raw.indexOf(":", servers.from);
  if (serversColon < 0) {
    return undefined;
  }
  const b = skipTrivia(raw, serversColon + 1);
  return raw[b] === "{" ? b : undefined;
}

export function findMcpServerSpan(raw: string, mcpId: string): { from: number; to: number; valueFrom: number } | undefined {
  const brace = serversObjectBrace(raw);
  if (brace === undefined) {
    return undefined;
  }
  const props = objectProps(raw, brace);
  const hits = props.filter((p) => p.key === mcpId);
  if (hits.length !== 1) {
    return undefined;
  }
  const hit = hits[0];
  const colon = raw.indexOf(":", hit.from);
  if (colon < 0) {
    return undefined;
  }
  const valueFrom = skipTrivia(raw, colon + 1);
  return { from: hit.from, to: hit.to, valueFrom };
}

export function pinPackageTokenInMcpServer(
  raw: string,
  mcpId: string,
  packageName: string,
  version: string,
  pinToken: (token: string, packageName: string, version: string) => string,
): { next: string; pinned: boolean } {
  const span = findMcpServerSpan(raw, mcpId);
  if (!span) {
    return { next: raw, pinned: false };
  }
  const before = raw.slice(0, span.valueFrom);
  const body = raw.slice(span.valueFrom, span.to);
  const after = raw.slice(span.to);
  let pinned = false;
  const nextBody = body.replace(/"(?:\\.|[^"\\])*"/g, (quoted) => {
    let token: string;
    try {
      token = JSON.parse(quoted) as string;
    } catch {
      return quoted;
    }
    if (typeof token !== "string") {
      return quoted;
    }
    const updated = pinToken(token, packageName, version);
    if (updated === token) {
      return quoted;
    }
    pinned = true;
    return JSON.stringify(updated);
  });
  return { next: before + nextBody + after, pinned };
}

export function replaceJsonSectionStringProp(
  raw: string,
  sectionKey: string,
  propKey: string,
  newValue: string,
): { next: string; changed: boolean } {
  try {
    const root = objectProps(raw, topObjectBrace(raw));
    const section = root.find((p) => p.key === sectionKey);
    if (!section) {
      return { next: raw, changed: false };
    }
    const brace = skipTrivia(raw, raw.indexOf("{", section.from));
    if (raw[brace] !== "{") {
      return { next: raw, changed: false };
    }
    const props = objectProps(raw, brace);
    const hit = props.find((p) => p.key === propKey);
    if (!hit) {
      return { next: raw, changed: false };
    }
    const colon = raw.indexOf(":", hit.from);
    const valueFrom = skipTrivia(raw, colon + 1);
    if (raw[valueFrom] !== "\"") {
      return { next: raw, changed: false };
    }
    const str = readJsonString(raw, valueFrom);
    if (!str) {
      return { next: raw, changed: false };
    }
    const next = raw.slice(0, valueFrom) + JSON.stringify(newValue) + raw.slice(str.end);
    return { next, changed: true };
  } catch {
    return { next: raw, changed: false };
  }
}

export function removeMcpServerEntry(raw: string, mcpId: string): { next: string; removed: boolean } {
  const brace = serversObjectBrace(raw);
  if (brace === undefined) {
    return { next: raw, removed: false };
  }
  const props = objectProps(raw, brace);
  if (props.filter((p) => p.key === mcpId).length !== 1) {
    return { next: raw, removed: false };
  }
  const idx = props.findIndex((p) => p.key === mcpId);
  if (idx < 0) {
    return { next: raw, removed: false };
  }
  let next: string;
  if (props.length === 1) {
    next = raw.slice(0, props[0].from) + raw.slice(props[0].to);
  } else if (idx === props.length - 1) {
    next = raw.slice(0, props[idx - 1].to) + raw.slice(props[idx].to);
  } else {
    next = raw.slice(0, props[idx].from) + raw.slice(props[idx + 1].from);
  }
  return { next, removed: true };
}
