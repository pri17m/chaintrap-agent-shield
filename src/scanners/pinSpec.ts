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

export function pypiRequirementName(line: string): string | undefined {
  const t = line.trim();
  if (!t || t.startsWith("#") || t.startsWith("-")) {
    return undefined;
  }
  const name = t.split(/[=<>!~\s[]/)[0]?.trim();
  return name ? name.toLowerCase().replace(/_/g, "-") : undefined;
}
