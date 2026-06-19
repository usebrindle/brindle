/**
 * Resolves merge-base between PR base and head for familiarity measurement.
 *
 * @see docs/designs/lld-author-familiarity-criterion.md
 */
import { runGitCommand } from "./gitCommand.js";
import type { HydrateFamiliarityPrContextDependencies } from "./hydrateFamiliarityPrContext.types.js";

/**
 * @param repositoryRoot - Absolute path to the checked-out git repository.
 * @param baseRef - PR base ref (branch name or SHA).
 * @param headRef - PR head ref (branch name or SHA).
 * @returns Merge-base commit SHA between `baseRef` and `headRef`.
 */
export const resolveMergeBaseRevision = (
  repositoryRoot: string,
  baseRef: string,
  headRef: string,
  dependencies?: HydrateFamiliarityPrContextDependencies,
): string => {
  const runGit = dependencies?.runGitCommand ?? runGitCommand;
  const mergeBaseRevision = runGit(repositoryRoot, ["merge-base", baseRef, headRef]).trim();

  if (mergeBaseRevision.length === 0) {
    throw new Error(
      `git merge-base returned empty output for base ref "${baseRef}" and head ref "${headRef}".`,
    );
  }

  return mergeBaseRevision;
};
