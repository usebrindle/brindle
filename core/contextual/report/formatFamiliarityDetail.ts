/**
 * Per-file familiarity detail line for Contextual evidence markdown.
 *
 * @see docs/designs/lld-contextual-evidence-reporting.md
 * @see docs/designs/lld-author-familiarity-criterion.md
 */
import type { FamiliarityFinding } from "../contextual.types.js";
import { describeHistoryWindowBeforePr } from "./describeHistoryWindow.js";
import type { FormatFamiliarityDetailOptions } from "./contextualEvidenceReport.types.js";
import { formatPercentForDisplay } from "./formatPercentForDisplay.js";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const formatLastTouchPhrase = (lastTouchDate: Date | null, classifiedAt: Date): string => {
  if (lastTouchDate === null) {
    return "no last touch in window";
  }
  const dayCount = Math.floor(
    (classifiedAt.getTime() - lastTouchDate.getTime()) / MILLISECONDS_PER_DAY,
  );
  if (dayCount <= 0) {
    return "last touch today";
  }
  if (dayCount === 1) {
    return "last touch 1 day ago";
  }
  return `last touch ${dayCount} days ago`;
};

const formatCommitSuffix = (finding: FamiliarityFinding, classifiedAt: Date): string => {
  if (finding.authorCommitCount === 0) {
    return `no author commits in window; ${finding.totalFileCommitCount} commits by others in window`;
  }

  const commitLabel =
    finding.authorCommitCount === 1
      ? "1 commit"
      : `${finding.authorCommitCount} commits`;
  const lastTouchPhrase = formatLastTouchPhrase(finding.lastTouchDate, classifiedAt);
  const othersCommitCount = finding.totalFileCommitCount - finding.authorCommitCount;

  if (othersCommitCount > 0) {
    return `${commitLabel}, ${lastTouchPhrase}; ${othersCommitCount} commits by others in window`;
  }

  return `${commitLabel}, ${lastTouchPhrase}`;
};

const formatCommitOnlyFamiliarityDetail = (
  finding: FamiliarityFinding,
  windowLabel: string,
  classifiedAt: Date,
): string => {
  if (finding.authorCommitCount === 0) {
    return `Author had 0% commit activity in ${windowLabel} before this PR (no author commits in window; ${finding.totalFileCommitCount} commits by others in window).`;
  }

  const commitShare = formatPercentForDisplay(finding.shareOfFileCommitChurn);
  return `Author had ${commitShare} commit activity in ${windowLabel} before this PR (${formatCommitSuffix(finding, classifiedAt)}).`;
};

/**
 * @param finding - Single per-file familiarity finding from hydration.
 * @param options - History window and classified-at instant for relative copy.
 * @returns Detail sentence (no path or tier label).
 */
export const formatFamiliarityDetail = (
  finding: FamiliarityFinding,
  options?: FormatFamiliarityDetailOptions,
): string => {
  if (finding.changeKind === "added") {
    return "File added in this PR; no prior history on this path. Author is the sole contributor in this change.";
  }

  const historyWindowDays = options?.historyWindowDays ?? 180;
  const windowLabel = describeHistoryWindowBeforePr(historyWindowDays);
  const classifiedAt = options?.classifiedAt ?? new Date();

  const isSoleLineOwner =
    finding.totalBlameableLineCount > 0 &&
    finding.authorOwnedLineCount === finding.totalBlameableLineCount;

  if (isSoleLineOwner) {
    return `Author owned 100% of lines in ${windowLabel} before this PR (${formatCommitSuffix(finding, classifiedAt)}).`;
  }

  if (finding.totalBlameableLineCount === 0) {
    return formatCommitOnlyFamiliarityDetail(finding, windowLabel, classifiedAt);
  }

  if (finding.authorCommitCount === 0) {
    return `Author owned 0% of lines and 0% of line churn in ${windowLabel} before this PR (no author commits in window; ${finding.totalFileCommitCount} commits by others in window).`;
  }

  const lineShare = formatPercentForDisplay(finding.shareOfCurrentContent);
  const churnShare = formatPercentForDisplay(finding.shareOfWindowedLineChurn);
  return `Author owned ${lineShare} of lines and ${churnShare} of line churn in ${windowLabel} before this PR (${formatCommitSuffix(finding, classifiedAt)}).`;
};
