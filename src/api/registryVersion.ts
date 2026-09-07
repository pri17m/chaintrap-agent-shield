import type { Ecosystem } from "../types";
import { isWritableEcosystem } from "../scanners/ecosystems";
import { compareSemver } from "../scanners/pinSpec";
import { isPinVersion } from "../store/pinMcp";

const UA = "chaintrap-agent-shield/0.1";
const TIMEOUT_MS = 8000;

export function npmRegistryLatestUrl(packageName: string): string {
  const name = packageName.trim();
  const encoded = name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
  return `https://registry.npmjs.org/${encoded}/latest`;
}

export function pypiJsonUrl(packageName: string): string {
  return `https://pypi.org/pypi/${encodeURIComponent(packageName.trim())}/json`;
}

export function npmPackumentUrl(packageName: string): string {
  const name = packageName.trim();
  const encoded = name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
  return `https://registry.npmjs.org/${encoded}`;
}

export function mavenMetadataUrl(coord: string): string | undefined {
  const colon = coord.indexOf(":");
  if (colon <= 0) {
    return undefined;
  }
  const group = coord.slice(0, colon).trim().replace(/\./g, "/");
  const artifact = coord.slice(colon + 1).trim();
  if (!group || !artifact) {
    return undefined;
  }
  return `https://repo1.maven.org/maven2/${group}/${artifact}/maven-metadata.xml`;
}

export function goProxyListUrl(module: string): string {
  const encoded = module.replace(/[A-Z]/g, (ch) => `!${ch.toLowerCase()}`);
  return `https://proxy.golang.org/${encoded}/@v/list`;
}

function cratesVersionsUrl(name: string): string {
  return `https://crates.io/api/v1/crates/${encodeURIComponent(name)}/versions`;
}

async function fetchText(
  url: string,
  fetchImpl: typeof fetch,
  accept = "application/json",
): Promise<string | undefined> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal: ac.signal,
      headers: { Accept: accept, "User-Agent": UA },
    });
    if (!res.ok) {
      return undefined;
    }
    if (typeof res.text === "function") {
      const text = await res.text();
      if (text) {
        return text;
      }
    }
    if (typeof (res as Response & { json?: () => Promise<unknown> }).json === "function") {
      return JSON.stringify(await res.json());
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

function filterPins(versions: string[]): string[] | undefined {
  const out = versions.map((k) => k.trim()).filter((k) => isPinVersion(k));
  return out.length ? out : undefined;
}

function versionsFromMavenMetadata(xml: string): string[] {
  const out: string[] = [];
  const re = /<version>\s*([^<]+)\s*<\/version>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    out.push(m[1].trim());
  }
  return out;
}

export async function fetchPublishedVersions(
  ecosystem: Ecosystem,
  packageName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[] | undefined> {
  const name = packageName.trim();
  if (!name) {
    return undefined;
  }
  if (!isWritableEcosystem(ecosystem) && ecosystem !== "hex") {
    return undefined;
  }

  if (ecosystem === "npm") {
    const text = await fetchText(npmPackumentUrl(name), fetchImpl);
    if (!text) {
      return undefined;
    }
    try {
      const body = JSON.parse(text) as { versions?: Record<string, unknown> };
      return filterPins(Object.keys(body.versions || {}));
    } catch {
      return undefined;
    }
  }

  if (ecosystem === "pypi") {
    const text = await fetchText(pypiJsonUrl(name), fetchImpl);
    if (!text) {
      return undefined;
    }
    try {
      const body = JSON.parse(text) as { releases?: Record<string, unknown> };
      return filterPins(Object.keys(body.releases || {}));
    } catch {
      return undefined;
    }
  }

  if (ecosystem === "maven") {
    const url = mavenMetadataUrl(name);
    if (!url) {
      return undefined;
    }
    const xml = await fetchText(url, fetchImpl, "application/xml");
    return xml ? filterPins(versionsFromMavenMetadata(xml)) : undefined;
  }

  if (ecosystem === "go") {
    const text = await fetchText(goProxyListUrl(name), fetchImpl, "text/plain");
    return text ? filterPins(text.split(/\r?\n/)) : undefined;
  }

  if (ecosystem === "crates") {
    const text = await fetchText(cratesVersionsUrl(name), fetchImpl);
    if (!text) {
      return undefined;
    }
    try {
      const body = JSON.parse(text) as { versions?: Array<{ num?: string }> };
      return filterPins((body.versions || []).map((v) => v.num || ""));
    } catch {
      return undefined;
    }
  }

  if (ecosystem === "rubygems") {
    const text = await fetchText(`https://rubygems.org/api/v1/versions/${encodeURIComponent(name)}.json`, fetchImpl);
    if (!text) {
      return undefined;
    }
    try {
      const body = JSON.parse(text) as Array<{ number?: string }>;
      return filterPins(body.map((v) => v.number || ""));
    } catch {
      return undefined;
    }
  }

  if (ecosystem === "nuget") {
    const text = await fetchText(
      `https://api.nuget.org/v3-flatcontainer/${encodeURIComponent(name.toLowerCase())}/index.json`,
      fetchImpl,
    );
    if (!text) {
      return undefined;
    }
    try {
      const body = JSON.parse(text) as { versions?: string[] };
      return filterPins(body.versions || []);
    } catch {
      return undefined;
    }
  }

  if (ecosystem === "packagist") {
    const text = await fetchText(`https://repo.packagist.org/p2/${name}.json`, fetchImpl);
    if (!text) {
      return undefined;
    }
    try {
      const body = JSON.parse(text) as { packages?: Record<string, Array<{ version?: string }>> };
      const list = body.packages?.[name] || body.packages?.[Object.keys(body.packages || {})[0] || ""] || [];
      return filterPins(list.map((v) => String(v.version || "").replace(/^v/i, "")));
    } catch {
      return undefined;
    }
  }

  if (ecosystem === "pub") {
    const text = await fetchText(`https://pub.dev/api/packages/${encodeURIComponent(name)}`, fetchImpl);
    if (!text) {
      return undefined;
    }
    try {
      const body = JSON.parse(text) as { versions?: Array<{ version?: string }> };
      return filterPins((body.versions || []).map((v) => v.version || ""));
    } catch {
      return undefined;
    }
  }

  if (ecosystem === "hex") {
    const text = await fetchText(`https://hex.pm/api/packages/${encodeURIComponent(name)}`, fetchImpl);
    if (!text) {
      return undefined;
    }
    try {
      const body = JSON.parse(text) as { releases?: Array<{ version?: string }> };
      return filterPins((body.releases || []).map((v) => v.version || ""));
    } catch {
      return undefined;
    }
  }

  if (ecosystem === "hackage") {
    const preferred = await fetchText(
      `https://hackage.haskell.org/package/${encodeURIComponent(name)}/preferred`,
      fetchImpl,
      "application/json",
    );
    if (preferred) {
      try {
        const body = JSON.parse(preferred) as { "normal-version"?: string[] };
        return filterPins(body["normal-version"] || []);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  if (ecosystem === "cran") {
    const text = await fetchText(`https://crandb.r-pkg.org/${encodeURIComponent(name)}`, fetchImpl);
    if (!text) {
      return undefined;
    }
    try {
      const body = JSON.parse(text) as { Version?: string; versions?: Record<string, unknown> };
      const keys = Object.keys(body.versions || {});
      if (keys.length) {
        return filterPins(keys);
      }
      return body.Version ? filterPins([body.Version]) : undefined;
    } catch {
      return undefined;
    }
  }

  if (ecosystem === "conan") {
    const text = await fetchText(`https://center.conan.io/v1/conans/${encodeURIComponent(name)}/search`, fetchImpl);
    if (!text) {
      return undefined;
    }
    try {
      const body = JSON.parse(text) as { results?: string[] } | string[];
      const list = Array.isArray(body) ? body : body.results || [];
      return filterPins(list.map((s) => String(s).split("/")[1] || String(s)));
    } catch {
      return undefined;
    }
  }

  if (ecosystem === "github_actions") {
    const slash = name.indexOf("/");
    if (slash <= 0) {
      return undefined;
    }
    const owner = name.slice(0, slash);
    const repo = name.slice(slash + 1);
    const text = await fetchText(`https://api.github.com/repos/${owner}/${repo}/tags?per_page=20`, fetchImpl);
    if (!text) {
      return undefined;
    }
    try {
      const body = JSON.parse(text) as Array<{ name?: string }>;
      return filterPins(body.map((t) => t.name || ""));
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export async function fetchLatestPackageVersion(
  ecosystem: Ecosystem,
  packageName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
  const name = packageName.trim();
  if (!name || !isWritableEcosystem(ecosystem)) {
    return undefined;
  }
  if (ecosystem === "npm") {
    const text = await fetchText(npmRegistryLatestUrl(name), fetchImpl);
    if (!text) {
      return undefined;
    }
    try {
      const body = JSON.parse(text) as { version?: unknown };
      const version = body.version;
      if (typeof version === "string" && isPinVersion(version)) {
        return version.trim();
      }
    } catch {
      return undefined;
    }
    return undefined;
  }
  if (ecosystem === "pypi") {
    const text = await fetchText(pypiJsonUrl(name), fetchImpl);
    if (!text) {
      return undefined;
    }
    try {
      const body = JSON.parse(text) as { info?: { version?: unknown } };
      const version = body.info?.version;
      if (typeof version === "string" && isPinVersion(version)) {
        return version.trim();
      }
    } catch {
      return undefined;
    }
    return undefined;
  }
  const published = await fetchPublishedVersions(ecosystem, name, fetchImpl);
  if (!published?.length) {
    return undefined;
  }
  return [...published].sort((a, b) => compareSemver(b, a))[0];
}
