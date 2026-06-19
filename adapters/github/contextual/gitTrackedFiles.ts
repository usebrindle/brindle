/**
 * Git-backed file listing for dependency graph hydration.
 *
 * @see docs/adrs/0010-contextual-analysis-at-head.md
 */
import { normalizeForwardSlashes } from "../../../core/contextual/pathNormalize.js";
import { runGitCommand } from "./gitCommand.js";

/**
 * @param repoRoot - Absolute path to the git repository root.
 * @returns Repo-relative tracked paths from `git ls-files` (forward slashes).
 */
export const listGitTrackedFiles = (repoRoot: string): readonly string[] => {
  const output = runGitCommand(repoRoot, ["ls-files", "-z"]);

  if (output.length === 0) {
    return [];
  }

  return output
    .split("\0")
    .filter((entry) => entry.length > 0)
    .map(normalizeForwardSlashes);
};
