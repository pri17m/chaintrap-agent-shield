import type { Ecosystem } from "../types";

export const ECOSYSTEMS: readonly Ecosystem[] = [
  "npm",
  "pypi",
  "maven",
  "go",
  "crates",
  "rubygems",
  "nuget",
  "packagist",
  "github_actions",
  "pub",
  "hex",
  "swift",
  "hackage",
  "cran",
  "conan",
] as const;

const OSV_ECOSYSTEM: Record<Ecosystem, string> = {
  npm: "npm",
  pypi: "PyPI",
  maven: "Maven",
  go: "Go",
  crates: "crates.io",
  rubygems: "RubyGems",
  nuget: "NuGet",
  packagist: "Packagist",
  github_actions: "GitHub Actions",
  pub: "Pub",
  hex: "Hex",
  swift: "SwiftURL",
  hackage: "Hackage",
  cran: "CRAN",
  conan: "ConanCenter",
};

const ECO_LABEL: Record<Ecosystem, string> = {
  npm: "npm",
  pypi: "PyPI",
  maven: "Maven",
  go: "Go",
  crates: "crates.io",
  rubygems: "RubyGems",
  nuget: "NuGet",
  packagist: "Packagist",
  github_actions: "GitHub Actions",
  pub: "Pub",
  hex: "Hex",
  swift: "Swift",
  hackage: "Hackage",
  cran: "CRAN",
  conan: "Conan",
};

const LOCK_HINT: Record<Ecosystem, string> = {
  npm: "package-lock.json, pnpm-lock.yaml, yarn.lock, or bun.lock",
  pypi: "uv.lock, poetry.lock, Pipfile.lock, pdm.lock, or pylock.toml",
  maven: "gradle.lockfile or gradle/verification-metadata.xml",
  go: "go.sum",
  crates: "Cargo.lock",
  rubygems: "Gemfile.lock or gems.locked",
  nuget: "packages.lock.json or packages.config",
  packagist: "composer.lock",
  github_actions: "a commit SHA pin on uses:",
  pub: "pubspec.lock",
  hex: "mix.lock",
  swift: "Package.resolved",
  hackage: "cabal.project.freeze or stack.yaml.lock",
  cran: "renv.lock",
  conan: "conan.lock",
};

export function osvEcosystemName(eco: Ecosystem): string {
  return OSV_ECOSYSTEM[eco];
}

export function ecosystemLabel(eco: Ecosystem): string {
  return ECO_LABEL[eco] || eco;
}

export function lockfileHint(eco: Ecosystem): string {
  return LOCK_HINT[eco] || "a lockfile";
}

/** Ecosystems Fix issues can write a manifest for. Swift/Hex DSLs are detect-only. */
export function isWritableEcosystem(eco?: Ecosystem): boolean {
  return Boolean(eco) && eco !== "swift" && eco !== "hex";
}

/** Lockfiles with checksums — never rewritten; look for a sibling manifest instead. */
export const HASHED_LOCK_BASENAMES = new Set([
  "cargo.lock",
  "go.sum",
  "gemfile.lock",
  "gems.locked",
  "composer.lock",
  "mix.lock",
  "package.resolved",
  "pubspec.lock",
]);

export function isHashedLockPath(filePath: string): boolean {
  const base = filePath.replace(/\\/g, "/").split("/").pop()?.toLowerCase() || "";
  return HASHED_LOCK_BASENAMES.has(base);
}

export function siblingManifestNames(eco: Ecosystem): string[] {
  switch (eco) {
    case "npm":
      return ["package.json"];
    case "pypi":
      return ["requirements.txt", "pyproject.toml"];
    case "maven":
      return ["pom.xml"];
    case "go":
      return ["go.mod"];
    case "crates":
      return ["Cargo.toml"];
    case "rubygems":
      return ["Gemfile"];
    case "nuget":
      return ["packages.config", "packages.lock.json"];
    case "packagist":
      return ["composer.json"];
    case "pub":
      return ["pubspec.yaml"];
    case "hackage":
      return ["cabal.project.freeze"];
    case "cran":
      return ["renv.lock"];
    case "conan":
      return ["conan.lock"];
    case "github_actions":
      return [];
    default:
      return [];
  }
}

export function normalizePackageName(eco: Ecosystem, name: string): string {
  const n = name.trim();
  if (!n) {
    return "";
  }
  if (eco === "go" || eco === "swift" || eco === "maven" || eco === "nuget") {
    return n;
  }
  if (eco === "pypi" || eco === "rubygems" || eco === "cran") {
    return n.toLowerCase().replace(/_/g, "-");
  }
  return n.toLowerCase();
}

/** Exact-enough version to send to OSV (semver, Maven, Go v-prefix, or git SHA). */
export function isExactVersionString(raw: string): boolean {
  const s = raw.trim();
  if (!s) {
    return false;
  }
  const lower = s.toLowerCase();
  if (lower === "*" || lower === "x" || lower === "latest" || lower === "next" || lower === "canary" || lower === "unknown") {
    return false;
  }
  if (/^[><=^~*]/.test(s) || s.includes("${") || s.includes("||")) {
    return false;
  }
  if (/^[0-9a-f]{40}$/i.test(s)) {
    return true;
  }
  const body = s.replace(/^v/i, "");
  return /^\d+\.\d+/.test(body);
}
