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
  let u: URL;
  try {
    u = new URL(raw, apiBase);
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return undefined;
  }
  return u.toString();
}
