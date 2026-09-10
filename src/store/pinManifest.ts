import { applyJsonIndent, replaceJsonSectionStringProp } from "./mcpJsonEdit";

const PKG_SECTIONS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];

export function pinPackageJsonDependency(raw: string, packageName: string, version: string): { next: string; changed: boolean } {
  let next = raw;
  let changed = false;
  for (const section of PKG_SECTIONS) {
    const step = replaceJsonSectionStringProp(next, section, packageName, version);
    if (step.changed) {
      next = step.next;
      changed = true;
    }
  }
  if (!changed) {
    return { next: raw, changed: false };
  }
  try {
    JSON.parse(next);
    return { next, changed: true };
  } catch {
    let doc: Record<string, unknown>;
    try {
      doc = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { next: raw, changed: false };
    }
    for (const key of PKG_SECTIONS) {
      const block = doc[key];
      if (block && typeof block === "object" && !Array.isArray(block) && packageName in (block as object)) {
        (block as Record<string, unknown>)[packageName] = version;
      }
    }
    return { next: applyJsonIndent(doc, raw), changed: true };
  }
}

export function pinRequirementVersion(raw: string, packageName: string, version: string): { next: string; changed: boolean } {
  const want = packageName.trim().toLowerCase();
  const nl = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);
  let changed = false;
  const out = lines.map((line) => {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("-")) {
      return line;
    }
    const name = t.split(/[=<>!~\s[]/)[0]?.trim().toLowerCase() || "";
    if (name !== want) {
      return line;
    }
    changed = true;
    return `${packageName}==${version}`;
  });
  if (!changed) {
    return { next: raw, changed: false };
  }
  let next = out.join(nl);
  if (raw.endsWith(nl) && !next.endsWith(nl)) {
    next += nl;
  }
  return { next, changed: true };
}
