/**
 * Checks whether a path exists in a git tree at a given revision.
 */
import { normalizeForwardSlashes } from "../../../core/contextual/pathNormalize.js";
import { assertSafeRepositoryRelativePath } from "./assertSafeRepositoryRelativePath.js";
import { runGitCommand } from "./gitCommand.js";
import type { HydrateFamiliarityPrContextDependencies } from "./hydrateFamiliarityPrContext.types.js";

/**
 * @returns `true` when `git cat-file -e <revision>:<path>` succeeds.
 */
export const pathExistsAtGitRevision = (
  repositoryRoot: string,
  revision: string,
  repositoryRelativePath: string,
  dependencies?: HydrateFamiliarityPrContextDependencies,
): boolean => {
  const runGit = dependencies?.runGitCommand ?? runGitCommand;
  assertSafeRepositoryRelativePath(repositoryRelativePath);
  const normalizedPath = normalizeForwardSlashes(repositoryRelativePath);

  try {
    runGit(repositoryRoot, ["cat-file", "-e", `${revision}:${normalizedPath}`]);
    return true;
  } catch {
    return false;
  }
};
