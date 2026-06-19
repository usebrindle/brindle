/**
 * Git-backed commit history source for author familiarity at merge-base.
 *
 * @see docs/designs/lld-author-familiarity-criterion.md
 * @see docs/adrs/0010-contextual-analysis-at-head.md
 */
import type {
  GitHistoryQuery,
  GitHistorySource,
  GitHistoryStats,
} from "../../../core/contextual/familiarity.types.js";
import { formatGitSinceDate } from "./formatGitSinceDate.js";
import { runGitCommand } from "./gitCommand.js";

const EMPTY_HISTORY_STATS: GitHistoryStats = {
  authorCommitCount: 0,
  totalFileCommitCount: 0,
  lastTouchDate: null,
};

const normalizeAuthorEmail = (authorEmail: string): string => authorEmail.trim().toLowerCase();

const parseGitLogAuthorEntries = (
  logOutput: string,
): readonly { authorEmail: string; authorTimestampSeconds: number }[] => {
  if (logOutput.length === 0) {
    return [];
  }

  const lines = logOutput.split("\n");
  const entries: { authorEmail: string; authorTimestampSeconds: number }[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 2) {
    const authorEmail = lines[lineIndex];
    const authorTimestampText = lines[lineIndex + 1];
    if (authorEmail === undefined || authorTimestampText === undefined) {
      continue;
    }

    const authorTimestampSeconds = Number.parseInt(authorTimestampText, 10);
    if (!Number.isFinite(authorTimestampSeconds)) {
      continue;
    }

    entries.push({
      authorEmail: normalizeAuthorEmail(authorEmail),
      authorTimestampSeconds,
    });
  }

  return entries;
};

const aggregateHistoryStats = (
  logEntries: readonly { authorEmail: string; authorTimestampSeconds: number }[],
  authorEmail: string,
): GitHistoryStats => {
  const normalizedAuthorEmail = normalizeAuthorEmail(authorEmail);
  let authorCommitCount = 0;
  let latestAuthorTimestampSeconds: number | null = null;

  for (const logEntry of logEntries) {
    if (logEntry.authorEmail !== normalizedAuthorEmail) {
      continue;
    }

    authorCommitCount += 1;
    if (
      latestAuthorTimestampSeconds === null ||
      logEntry.authorTimestampSeconds > latestAuthorTimestampSeconds
    ) {
      latestAuthorTimestampSeconds = logEntry.authorTimestampSeconds;
    }
  }

  return {
    authorCommitCount,
    totalFileCommitCount: logEntries.length,
    lastTouchDate:
      latestAuthorTimestampSeconds === null
        ? null
        : new Date(latestAuthorTimestampSeconds * 1000),
  };
};

const queryGitHistoryStats = (repoRoot: string, query: GitHistoryQuery): GitHistoryStats => {
  const sinceDate = formatGitSinceDate(query.since);
  let logOutput = "";

  try {
    logOutput = runGitCommand(repoRoot, [
      "log",
      `--since=${sinceDate}`,
      query.revision,
      "--format=%ae%n%at",
      "--",
      query.path,
    ]);
  } catch {
    return EMPTY_HISTORY_STATS;
  }

  const logEntries = parseGitLogAuthorEntries(logOutput);
  return aggregateHistoryStats(logEntries, query.authorEmail);
};

/**
 * @param repoRoot - Absolute path to the checked-out git repository.
 * @returns {@link GitHistorySource} using `git log --since=… <revision> -- <path>`.
 */
export const createGitHistorySource = (repoRoot: string): GitHistorySource => ({
  query: (query: GitHistoryQuery): GitHistoryStats => queryGitHistoryStats(repoRoot, query),
});
