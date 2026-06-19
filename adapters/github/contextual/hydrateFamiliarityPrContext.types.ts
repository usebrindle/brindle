/**
 * Input and result types for familiarity PR-context hydration.
 *
 * @see docs/designs/lld-author-familiarity-criterion.md
 */
import type { ChangedFileEntry } from "../../../core/contextual/familiarity.types.js";

import type { runGitCommand } from "./gitCommand.js";

/** Injectable git subprocess for tests. */
export interface HydrateFamiliarityPrContextDependencies {
  runGitCommand?: typeof runGitCommand;
}

/** Arguments for merge-base, change-kind, and author-email hydration. */
export interface HydrateFamiliarityPrContextInput {
  /** Absolute path to the checked-out git repository. */
  repositoryRoot: string;
  /** PR base ref (branch name or SHA). */
  baseRef: string;
  /** PR head ref (branch name or SHA). */
  headRef: string;
  /** GitHub login from {@link PRContext.author}. */
  authorLogin: string;
  /** Changed file paths from the pull request file list. */
  changedPaths: readonly string[];
  /** Optional override from `criteria.author_familiarity.options.author_emails`. */
  configAuthorEmails?: readonly string[];
}

/** Hydrated fields for {@link PRContext} familiarity queries. */
export interface HydrateFamiliarityPrContextResult {
  baseRevision: string;
  authorEmails: readonly string[];
  changedFileEntries: readonly ChangedFileEntry[];
}
