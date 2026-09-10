function isLoopbackHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

export type NormalizeApiBaseResult =
  | { ok: true; value: string }
  | { ok: false; error: "empty" | "invalid_url" | "credentials_not_allowed" | "unsupported_protocol" | "http_not_allowed" };

export function normalizeApiBase(raw: string): NormalizeApiBaseResult {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return { ok: false, error: "empty" };
  }
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  if (u.username || u.password) {
    return { ok: false, error: "credentials_not_allowed" };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return { ok: false, error: "unsupported_protocol" };
  }
  if (u.protocol === "http:" && !isLoopbackHost(u.hostname)) {
    return { ok: false, error: "http_not_allowed" };
  }
  u.hash = "";
  u.search = "";
  return { ok: true, value: u.toString().replace(/\/$/, "") };
}

export function resolveExternalHttpUrl(rawUrl: string, apiBase: string): string | undefined {
  const raw = String(rawUrl || "").trim();
  if (!raw) {
    return undefined;
  }
  let base: URL;
  try {
    base = new URL(String(apiBase || "").trim());
  } catch {
    return undefined;
  }
  let u: URL;
  try {
    u = new URL(raw, base);
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return undefined;
  }
  if (u.username || u.password) {
    return undefined;
  }
  // Only allow report URLs on the same origin as the API base.
  if (u.protocol !== base.protocol || u.hostname !== base.hostname || u.port !== base.port) {
    return undefined;
  }
  if (u.protocol === "http:" && !isLoopbackHost(u.hostname)) {
    return undefined;
  }
  return u.toString();
}

export function normalizeExternalHttpUrl(rawUrl: string): string | undefined {
  const raw = String(rawUrl || "").trim();
  if (!raw) {
    return undefined;
  }
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return undefined;
  }
  if (u.username || u.password) {
    return undefined;
  }
  return u.toString();
}
