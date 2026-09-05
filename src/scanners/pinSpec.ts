/** Exact npm pin we can send to OSV. Ranges, tags, and URL/git specs are not exact. */
export function isExactNpmSpec(raw: string): boolean {
  const s = raw.trim();
  if (!s) {
    return false;
  }
  const lower = s.toLowerCase();
  if (lower === "*" || lower === "x" || lower === "latest" || lower === "next" || lower === "canary") {
    return false;
  }
  if (/^(git\+|github:|gitlab:|bitbucket:|git:|http:|https:|file:|workspace:|npm:|link:|gist:)/i.test(s)) {
    return false;
  }
  if (s.includes("||") || /\s-\s/.test(s)) {
    return false;
  }
  if (/^[><=^~]/.test(s)) {
    return false;
  }
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(s);
}

/** PyPI exact pin: ==1.2.3 only. */
export function isExactPypiRequirement(line: string): { name: string; version: string } | undefined {
  const t = line.trim();
  if (!t || t.startsWith("#") || t.startsWith("-")) {
    return undefined;
  }
  const exact = t.match(/^([A-Za-z0-9_.-]+)\s*==\s*([^\s;#]+)/);
  if (exact) {
    return { name: exact[1].toLowerCase().replace(/_/g, "-"), version: exact[2] };
  }
  return undefined;
}

export function isUnpinnableSpec(raw: string): boolean {
  const s = raw.trim();
  if (!s) {
    return false;
  }
  return /^(git\+|github:|gitlab:|bitbucket:|git:|http:|https:|file:|workspace:|npm:|link:|gist:)/i.test(s);
}

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
}

export function parseSemver(raw: string): SemVer | undefined {
  const s = raw.trim().replace(/^[vV]/, "");
  if (!s) {
    return undefined;
  }
  const noLocal = s.split("+")[0];
  const stripped = noLocal.replace(/\.post\d+$/i, "");
  const m = stripped.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/);
  if (!m) {
    return undefined;
  }
  return { major: Number(m[1]), minor: Number(m[2] || 0), patch: Number(m[3] || 0), prerelease: m[4] || "" };
}

export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) {
    return a.localeCompare(b);
  }
  if (pa.major !== pb.major) {
    return pa.major - pb.major;
  }
  if (pa.minor !== pb.minor) {
    return pa.minor - pb.minor;
  }
  if (pa.patch !== pb.patch) {
    return pa.patch - pb.patch;
  }
  if (!pa.prerelease && pb.prerelease) {
    return 1;
  }
  if (pa.prerelease && !pb.prerelease) {
    return -1;
  }
  return pa.prerelease.localeCompare(pb.prerelease);
}

function cmpVer(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) {
    return a.major - b.major;
  }
  if (a.minor !== b.minor) {
    return a.minor - b.minor;
  }
  return a.patch - b.patch;
}

function caretUpper(t: SemVer): SemVer {
  if (t.major > 0) {
    return { major: t.major + 1, minor: 0, patch: 0, prerelease: "" };
  }
  if (t.minor > 0) {
    return { major: 0, minor: t.minor + 1, patch: 0, prerelease: "" };
  }
  return { major: 0, minor: 0, patch: t.patch + 1, prerelease: "" };
}

function tildeUpper(t: SemVer): SemVer {
  return { major: t.major, minor: t.minor + 1, patch: 0, prerelease: "" };
}

/** Whether published `version` may be written for a range/tag/unpinned spec. */
export function satisfiesRange(spec: string, version: string): boolean {
  const v = parseSemver(version);
  if (!v || v.prerelease) {
    return false;
  }
  const s = spec.trim();
  if (!s || s === "*" || s === "x" || s === "unknown" || s.toLowerCase() === "latest") {
    return true;
  }
  if (isUnpinnableSpec(s)) {
    return false;
  }
  const eq = s.match(/^([A-Za-z0-9_.-]+)?\s*==\s*([^\s;#]+)$/);
  if (eq) {
    return eq[2] === version;
  }
  const op = s.match(/^(>=|<=|>|<|~=|\^|~)\s*(.+)$/);
  if (!op) {
    return isExactNpmSpec(s) ? s === version : false;
  }
  const target = parseSemver(op[2].replace(/^[vV]/, ""));
  if (!target) {
    return false;
  }
  const c = cmpVer(v, target);
  switch (op[1]) {
    case ">=":
      return c >= 0;
    case ">":
      return c > 0;
    case "<=":
      return c <= 0;
    case "<":
      return c < 0;
    case "^":
      return c >= 0 && cmpVer(v, caretUpper(target)) < 0;
    case "~":
    case "~=":
      return c >= 0 && cmpVer(v, tildeUpper(target)) < 0;
    default:
      return false;
  }
}

export function implicitSameMajorRange(version: string): string | undefined {
  const v = parseSemver(version);
  if (!v) {
    return undefined;
  }
  return `^${v.major}.${v.minor}.${v.patch}`;
}

export function pypiRequirementName(line: string): string | undefined {
  const t = line.trim();
  if (!t || t.startsWith("#") || t.startsWith("-")) {
    return undefined;
  }
  const name = t.split(/[=<>!~\s[]/)[0]?.trim();
  return name ? name.toLowerCase().replace(/_/g, "-") : undefined;
}
