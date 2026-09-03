import * as os from "os";
import * as path from "path";

export interface HomeWatchRoot {
  dir: string;
  pattern: string;
}

/** Pure helper for tests — RelativePattern(dir, pattern) must not embed ** in dir. */
export function homeWatchRoots(home = os.homedir()): HomeWatchRoot[] {
  return [
    { dir: path.join(home, ".cursor"), pattern: "mcp.json" },
    { dir: path.join(home, ".cursor", "skills"), pattern: "**/*" },
    { dir: path.join(home, ".cursor", "commands"), pattern: "**/*" },
    { dir: path.join(home, ".cursor", "rules"), pattern: "**/*" },
    { dir: path.join(home, ".claude", "skills"), pattern: "**/*" },
    { dir: path.join(home, ".claude", "commands"), pattern: "**/*" },
  ];
}
