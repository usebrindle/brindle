/**
 * Shared git subprocess helper for contextual hydration.
 *
 * @see docs/adrs/0010-contextual-analysis-at-head.md
 */
import { execFileSync } from "node:child_process";

/**
 * Runs a git command in the repository root and returns stdout.
 *
 * @param repoRoot - Absolute path to the git repository.
 * @param gitArguments - Arguments after the `git` executable name.
 * @returns Trimmed stdout (empty string when git prints nothing).
 */
export const runGitCommand = (repoRoot: string, gitArguments: readonly string[]): string => {
  const output = execFileSync("git", gitArguments, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return output.trimEnd();
};
