/**
 * Pure author-familiarity analyzer at merge-base (pre-PR signals).
 *
 * @see docs/designs/lld-author-familiarity-criterion.md
 */
import type {
  FamiliarityFinding,
  FileChangeKind,
} from "./contextual.types.js";
import type {
  FamiliarityInput,
  GitBlameSource,
  GitBlameStats,
  GitHistorySource,
  GitHistoryStats,
} from "./familiarity.types.js";

const DEFAULT_HISTORY_WINDOW_DAYS = 180;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const EMPTY_HISTORY_STATS: GitHistoryStats = {
  authorCommitCount: 0,
  totalFileCommitCount: 0,
  lastTouchDate: null,
};

const EMPTY_BLAME_STATS: GitBlameStats = {
  authorOwnedLineCount: 0,
  totalBlameableLineCount: 0,
  authorChangedLineCount: 0,
  totalChangedLineCount: 0,
};

/** Compute the `--since` boundary for git history and blame queries. */
export const historyWindowSince = (
  classifiedAt: Date,
  historyWindowDays: number = DEFAULT_HISTORY_WINDOW_DAYS,
): Date =>
  new Date(classifiedAt.getTime() - historyWindowDays * MILLISECONDS_PER_DAY);

/** Author's share of blameable lines at merge-base (0 when none). */
export const shareOfCurrentContent = (
  authorOwnedLineCount: number,
  totalBlameableLineCount: number,
): number => {
  if (totalBlameableLineCount === 0) {
    return 0;
  }
  return authorOwnedLineCount / totalBlameableLineCount;
};

/** Author's share of line changes within the history window (0 when none). */
export const shareOfWindowedLineChurn = (
  authorChangedLineCount: number,
  totalChangedLineCount: number,
): number => {
  if (totalChangedLineCount === 0) {
    return 0;
  }
  return authorChangedLineCount / totalChangedLineCount;
};

/** Author's share of total commits to a file (0 when the file has no churn). */
export const shareOfFileCommitChurn = (
  authorCommitCount: number,
  totalFileCommitCount: number,
): number => {
  if (totalFileCommitCount === 0) {
    return 0;
  }
  return authorCommitCount / totalFileCommitCount;
};

const daysSince = (date: Date, classifiedAt: Date): number =>
  Math.floor((classifiedAt.getTime() - date.getTime()) / MILLISECONDS_PER_DAY);

const createGreenfieldFinding = (
  touchedFile: string,
  changeKind: FileChangeKind,
): FamiliarityFinding => ({
  touchedFile,
  changeKind,
  authorOwnedLineCount: 0,
  totalBlameableLineCount: 0,
  shareOfCurrentContent: 0,
  authorChangedLineCount: 0,
  totalChangedLineCount: 0,
  shareOfWindowedLineChurn: 0,
  authorCommitCount: 0,
  totalFileCommitCount: 0,
  lastTouchDate: null,
  shareOfFileCommitChurn: 0,
  characterization: "high",
});

/**
 * Map pre-PR signals to a familiarity tier for modified files.
 *
 * Greenfield (`added`) files bypass this — see {@link analyzeFamiliarity}.
 */
export const characterizeFamiliarity = (
  authorCommitCount: number,
  totalFileCommitCount: number,
  lastTouchDate: Date | null,
  currentContentShare: number = 0,
  windowedLineChurnShare: number = 0,
  classifiedAt: Date,
): Pick<FamiliarityFinding, "shareOfFileCommitChurn" | "characterization"> => {
  const commitChurnShare = shareOfFileCommitChurn(authorCommitCount, totalFileCommitCount);

  if (authorCommitCount === 0 || lastTouchDate === null) {
    return { shareOfFileCommitChurn: commitChurnShare, characterization: "none" };
  }

  const recencyDays = daysSince(lastTouchDate, classifiedAt);

  if (recencyDays > 180) {
    return { shareOfFileCommitChurn: commitChurnShare, characterization: "none" };
  }

  if (recencyDays > 120 && authorCommitCount === 1) {
    return { shareOfFileCommitChurn: commitChurnShare, characterization: "none" };
  }

  const qualifiesForHigh =
    recencyDays <= 60 &&
    (currentContentShare >= 0.25 ||
      windowedLineChurnShare >= 0.25 ||
      authorCommitCount >= 3);

  if (qualifiesForHigh) {
    return { shareOfFileCommitChurn: commitChurnShare, characterization: "high" };
  }

  const qualifiesForModerate =
    (recencyDays <= 120 && authorCommitCount >= 2) ||
    (recencyDays > 120 && recencyDays <= 180 && authorCommitCount >= 2) ||
    (recencyDays <= 120 &&
      (currentContentShare >= 0.1 || windowedLineChurnShare >= 0.1));

  if (qualifiesForModerate) {
    return { shareOfFileCommitChurn: commitChurnShare, characterization: "moderate" };
  }

  return { shareOfFileCommitChurn: commitChurnShare, characterization: "none" };
};

const queryHistoryForAuthorEmails = (
  authorEmails: readonly string[],
  path: string,
  since: Date,
  revision: string,
  historySource: GitHistorySource,
): GitHistoryStats => {
  if (authorEmails.length === 0) {
    return EMPTY_HISTORY_STATS;
  }

  let authorCommitCount = 0;
  let totalFileCommitCount = 0;
  let latestLastTouchDate: Date | null = null;

  for (const authorEmail of authorEmails) {
    const stats = historySource.query({ authorEmail, path, since, revision });
    authorCommitCount += stats.authorCommitCount;
    totalFileCommitCount = Math.max(totalFileCommitCount, stats.totalFileCommitCount);
    if (
      stats.lastTouchDate !== null &&
      (latestLastTouchDate === null || stats.lastTouchDate > latestLastTouchDate)
    ) {
      latestLastTouchDate = stats.lastTouchDate;
    }
  }

  return {
    authorCommitCount,
    totalFileCommitCount,
    lastTouchDate: latestLastTouchDate,
  };
};

const queryBlameForAuthorEmails = (
  authorEmails: readonly string[],
  path: string,
  since: Date,
  revision: string,
  blameSource: GitBlameSource,
): GitBlameStats => {
  if (authorEmails.length === 0) {
    return EMPTY_BLAME_STATS;
  }

  let authorOwnedLineCount = 0;
  let totalBlameableLineCount = 0;
  let authorChangedLineCount = 0;
  let totalChangedLineCount = 0;

  for (const authorEmail of authorEmails) {
    const stats = blameSource.query({ path, authorEmail, since, revision });
    authorOwnedLineCount += stats.authorOwnedLineCount;
    totalBlameableLineCount = Math.max(totalBlameableLineCount, stats.totalBlameableLineCount);
    authorChangedLineCount += stats.authorChangedLineCount;
    totalChangedLineCount = Math.max(totalChangedLineCount, stats.totalChangedLineCount);
  }

  return {
    authorOwnedLineCount,
    totalBlameableLineCount,
    authorChangedLineCount,
    totalChangedLineCount,
  };
};

const analyzeModifiedFile = (
  input: FamiliarityInput,
  changedFile: { path: string; changeKind: FileChangeKind },
  since: Date,
): FamiliarityFinding => {
  const historyStats = queryHistoryForAuthorEmails(
    input.authorEmails,
    changedFile.path,
    since,
    input.baseRevision,
    input.historySource,
  );
  const blameStats = queryBlameForAuthorEmails(
    input.authorEmails,
    changedFile.path,
    since,
    input.baseRevision,
    input.blameSource,
  );

  const currentContentShare = shareOfCurrentContent(
    blameStats.authorOwnedLineCount,
    blameStats.totalBlameableLineCount,
  );
  const windowedLineChurnShare = shareOfWindowedLineChurn(
    blameStats.authorChangedLineCount,
    blameStats.totalChangedLineCount,
  );

  const { shareOfFileCommitChurn, characterization } = characterizeFamiliarity(
    historyStats.authorCommitCount,
    historyStats.totalFileCommitCount,
    historyStats.lastTouchDate,
    currentContentShare,
    windowedLineChurnShare,
    input.classifiedAt,
  );

  return {
    touchedFile: changedFile.path,
    changeKind: changedFile.changeKind,
    authorOwnedLineCount: blameStats.authorOwnedLineCount,
    totalBlameableLineCount: blameStats.totalBlameableLineCount,
    shareOfCurrentContent: currentContentShare,
    authorChangedLineCount: blameStats.authorChangedLineCount,
    totalChangedLineCount: blameStats.totalChangedLineCount,
    shareOfWindowedLineChurn: windowedLineChurnShare,
    authorCommitCount: historyStats.authorCommitCount,
    totalFileCommitCount: historyStats.totalFileCommitCount,
    lastTouchDate: historyStats.lastTouchDate,
    shareOfFileCommitChurn,
    characterization,
  };
};

/**
 * Produce per-file familiarity findings at merge-base for changed paths.
 *
 * Added files use the greenfield gate (`high`) without git queries.
 *
 * @param input - Author emails, changed files, git source ports, and merge-base revision.
 * @returns One finding per changed file in input order.
 */
export const analyzeFamiliarity = (input: FamiliarityInput): FamiliarityFinding[] => {
  const historyWindowDays = input.historyWindowDays ?? DEFAULT_HISTORY_WINDOW_DAYS;
  const since = historyWindowSince(input.classifiedAt, historyWindowDays);

  return input.changedFiles.map((changedFile) => {
    if (changedFile.changeKind === "added") {
      return createGreenfieldFinding(changedFile.path, changedFile.changeKind);
    }

    return analyzeModifiedFile(input, changedFile, since);
  });
};
