import type { Ecosystem } from "../types";
import { isPinVersion } from "../store/pinMcp";

export function npmRegistryLatestUrl(packageName: string): string {
  const name = packageName.trim();
  const encoded = name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
  return `https://registry.npmjs.org/${encoded}/latest`;
}

export function pypiJsonUrl(packageName: string): string {
  return `https://pypi.org/pypi/${encodeURIComponent(packageName.trim())}/json`;
}

export async function fetchLatestPackageVersion(
  ecosystem: Ecosystem,
  packageName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
  const name = packageName.trim();
  if (!name) {
    return undefined;
  }
  const url = ecosystem === "pypi" ? pypiJsonUrl(name) : npmRegistryLatestUrl(name);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetchImpl(url, { signal: ac.signal, headers: { Accept: "application/json" } });
    if (!res.ok) {
      return undefined;
    }
    const body = (await res.json()) as { version?: unknown; info?: { version?: unknown } };
    const version = ecosystem === "pypi" ? body.info?.version : body.version;
    if (typeof version !== "string" || !isPinVersion(version)) {
      return undefined;
    }
    return version.trim();
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
