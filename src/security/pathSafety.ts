import * as fs from "fs";
import * as path from "path";

export type SafePathResult =
  | { ok: true; resolved: string; real: string }
  | { ok: false; reason: "not_absolute" | "missing" | "not_a_file" | "symlink" | "outside_allowed_roots" | "realpath_failed" };

function isWithinRoot(childAbs: string, rootAbs: string): boolean {
  const rel = path.relative(rootAbs, childAbs);
  if (!rel) {
    return true;
  }
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

function safeRealpath(p: string): string | null {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return null;
  }
}

function normalizeAbs(p: string): string {
  return path.resolve(p);
}

function samePath(aAbs: string, bAbs: string): boolean {
  if (process.platform === "win32") {
    return normalizeAbs(aAbs).toLowerCase() === normalizeAbs(bAbs).toLowerCase();
  }
  return normalizeAbs(aAbs) === normalizeAbs(bAbs);
}

export function safeExistingFilePath(
  targetPath: string,
  opts: { allowedRoots?: string[]; allowedExactFiles?: string[] } = {},
): SafePathResult {
  const resolved = normalizeAbs(targetPath);
  if (!path.isAbsolute(resolved)) {
    return { ok: false, reason: "not_absolute" };
  }
  let st: fs.Stats;
  try {
    st = fs.lstatSync(resolved);
  } catch {
    return { ok: false, reason: "missing" };
  }
  if (st.isSymbolicLink()) {
    return { ok: false, reason: "symlink" };
  }
  if (!st.isFile()) {
    return { ok: false, reason: "not_a_file" };
  }
  const real = safeRealpath(resolved);
  if (!real) {
    return { ok: false, reason: "realpath_failed" };
  }

  const exact = (opts.allowedExactFiles || []).map(normalizeAbs);
  if (exact.some((p) => samePath(p, resolved))) {
    return { ok: true, resolved, real };
  }

  const roots = (opts.allowedRoots || []).map((r) => safeRealpath(r) || normalizeAbs(r));
  if (roots.length === 0) {
    return { ok: false, reason: "outside_allowed_roots" };
  }
  const ok = roots.some((root) => isWithinRoot(real, normalizeAbs(root)));
  return ok ? { ok: true, resolved, real } : { ok: false, reason: "outside_allowed_roots" };
}

