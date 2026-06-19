/**
 * Git-backed file listing for dependency graph hydration.
 *
 * @see docs/adrs/0010-contextual-analysis-at-head.md
 */
import { execFileSync } from "node:child_process";

const normalizeForwardSlashes = (filePath: string): string => filePath.replace(/\\/g, "/");

/**
 * @param repoRoot - Absolute path to the git repository root.
 * @returns Repo-relative tracked paths from `git ls-files` (forward slashes).
 */
export const listGitTrackedFiles = (repoRoot: string): readonly string[] => {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (output.length === 0) {
    return [];
  }

  return output
    .split("\0")
    .filter((entry) => entry.length > 0)
    .map(normalizeForwardSlashes);
};
