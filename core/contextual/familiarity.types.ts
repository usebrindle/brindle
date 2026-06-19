/**
 * Pure analyzer contracts for author-familiarity git sources.
 *
 * Impure implementations live in `adapters/github/contextual/`.
 *
 * @see docs/designs/lld-author-familiarity-criterion.md
 */
import type { FileChangeKind } from "./contextual.types.js";

/** Changed file entry for familiarity analysis input. */
export interface ChangedFileEntry {
  path: string;
  changeKind: FileChangeKind;
}

/** Commit-history query scoped to merge-base (excludes `base..head`). */
export interface GitHistoryQuery {
  authorEmail: string;
  path: string;
  since: Date;
  /** Merge-base revision — git log stops at this commit tree. */
  revision: string;
}

/** Commit counts and recency for one path at merge-base. */
export interface GitHistoryStats {
  authorCommitCount: number;
  totalFileCommitCount: number;
  lastTouchDate: Date | null;
}

/** Port for commit-history lookups during familiarity hydration. */
export interface GitHistorySource {
  query(query: GitHistoryQuery): GitHistoryStats;
}

/** Blame query scoped to merge-base (excludes `base..head`). */
export interface GitBlameQuery {
  path: string;
  authorEmail: string;
  since: Date;
  /** Merge-base revision — blame reads file content at this commit. */
  revision: string;
}

/** Line ownership and windowed churn for one path at merge-base. */
export interface GitBlameStats {
  authorOwnedLineCount: number;
  totalBlameableLineCount: number;
  authorChangedLineCount: number;
  totalChangedLineCount: number;
}

/** Port for blame lookups during familiarity hydration. */
export interface GitBlameSource {
  query(query: GitBlameQuery): GitBlameStats;
}

/** Input for pure {@link analyzeFamiliarity} at merge-base. */
export interface FamiliarityInput {
  /** Resolved author emails — git queries match any email in the list. */
  authorEmails: readonly string[];
  changedFiles: readonly ChangedFileEntry[];
  historySource: GitHistorySource;
  blameSource: GitBlameSource;
  /** Merge-base revision; all git queries stop here (exclude `base..head`). */
  baseRevision: string;
  /** History window in days for commits and windowed line churn (default 180). */
  historyWindowDays?: number;
  /** Reference time from {@link PRContext.classifiedAtIso} — no `Date.now()` in analyzer. */
  classifiedAt: Date;
}
