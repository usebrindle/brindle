/**
 * Hydrates merge-base revision, change kinds, and author emails for familiarity.
 *
 * @see docs/designs/lld-author-familiarity-criterion.md
 * @see docs/adrs/0010-contextual-analysis-at-head.md
 */
import type {
  HydrateFamiliarityPrContextDependencies,
  HydrateFamiliarityPrContextInput,
  HydrateFamiliarityPrContextResult,
} from "./hydrateFamiliarityPrContext.types.js";
import { resolveAuthorEmails, resolveHeadCommitAuthorEmail } from "./resolveAuthorEmails.js";
import { resolveChangedFileEntries } from "./resolveChangedFileEntries.js";
import { resolveMergeBaseRevision } from "./resolveMergeBaseRevision.js";

/**
 * Computes {@link PRContext} familiarity fields from a checked-out repository.
 */
export const hydrateFamiliarityPrContext = (
  input: HydrateFamiliarityPrContextInput,
  dependencies?: HydrateFamiliarityPrContextDependencies,
): HydrateFamiliarityPrContextResult => {
  const baseRevision = resolveMergeBaseRevision(
    input.repositoryRoot,
    input.baseRef,
    input.headRef,
    dependencies,
  );

  const headCommitAuthorEmail = resolveHeadCommitAuthorEmail(
    input.repositoryRoot,
    input.headRef,
    dependencies,
  );

  const authorEmails = resolveAuthorEmails(
    headCommitAuthorEmail,
    input.authorLogin,
    input.configAuthorEmails,
  );

  const changedFileEntries = resolveChangedFileEntries(
    input.repositoryRoot,
    input.baseRef,
    input.headRef,
    baseRevision,
    input.changedPaths,
    dependencies,
  );

  return {
    baseRevision,
    authorEmails,
    changedFileEntries,
  };
};
