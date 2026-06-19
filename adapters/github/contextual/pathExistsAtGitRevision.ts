/**
 * Checks whether a path exists in a git tree at a given revision.
 */
import { runGitCommand } from "./gitCommand.js";
import type { HydrateFamiliarityPrContextDependencies } from "./hydrateFamiliarityPrContext.types.js";

const normalizeRepositoryRelativePath = (repositoryRelativePath: string): string =>
  repositoryRelativePath.replace(/\\/g, "/");

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
  const normalizedPath = normalizeRepositoryRelativePath(repositoryRelativePath);

  try {
    runGit(repositoryRoot, ["cat-file", "-e", `${revision}:${normalizedPath}`]);
    return true;
  } catch {
    return false;
  }
};
