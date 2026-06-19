/**
 * Git-backed blame source for author familiarity at merge-base.
 *
 * @see docs/designs/lld-author-familiarity-criterion.md
 * @see docs/adrs/0010-contextual-analysis-at-head.md
 */
import type {
  GitBlameQuery,
  GitBlameSource,
  GitBlameStats,
} from "../../../core/contextual/familiarity.types.js";
import { formatGitSinceDate } from "./formatGitSinceDate.js";
import { runGitCommand } from "./gitCommand.js";
import { assertSafeRepositoryRelativePath } from "./assertSafeRepositoryRelativePath.js";
import { aggregateGitBlameStats, parseGitBlameOutput } from "./parseGitBlameOutput.js";

const EMPTY_BLAME_STATS: GitBlameStats = {
  authorOwnedLineCount: 0,
  totalBlameableLineCount: 0,
  authorChangedLineCount: 0,
  totalChangedLineCount: 0,
};

const runGitBlame = (
  repoRoot: string,
  revision: string,
  path: string,
  since?: Date,
): string => {
  const gitArguments = ["blame", "-e", revision, "--"];
  if (since !== undefined) {
    gitArguments.splice(1, 0, `--since=${formatGitSinceDate(since)}`);
  }
  assertSafeRepositoryRelativePath(path);
  gitArguments.push(path);
  return runGitCommand(repoRoot, gitArguments);
};

const queryGitBlameStats = (repoRoot: string, query: GitBlameQuery): GitBlameStats => {
  let contentOwnershipOutput: string;
  let windowedChurnOutput: string;

  try {
    contentOwnershipOutput = runGitBlame(repoRoot, query.revision, query.path);
    windowedChurnOutput = runGitBlame(repoRoot, query.revision, query.path, query.since);
  } catch {
    return EMPTY_BLAME_STATS;
  }

  const contentOwnershipStats = aggregateGitBlameStats(
    parseGitBlameOutput(contentOwnershipOutput),
    query.authorEmail,
    false,
  );
  const windowedChurnStats = aggregateGitBlameStats(
    parseGitBlameOutput(windowedChurnOutput),
    query.authorEmail,
    true,
  );

  return {
    authorOwnedLineCount: contentOwnershipStats.authorOwnedLineCount,
    totalBlameableLineCount: contentOwnershipStats.totalBlameableLineCount,
    authorChangedLineCount: windowedChurnStats.authorChangedLineCount,
    totalChangedLineCount: windowedChurnStats.totalChangedLineCount,
  };
};

/**
 * @param repoRoot - Absolute path to the checked-out git repository.
 * @returns {@link GitBlameSource} using `git blame <revision>` and `git blame --since=… <revision>`.
 */
export const createGitBlameSource = (repoRoot: string): GitBlameSource => ({
  query: (query: GitBlameQuery): GitBlameStats => queryGitBlameStats(repoRoot, query),
});
