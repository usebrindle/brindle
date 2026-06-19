/**
 * Human-readable history window labels for familiarity report copy.
 *
 * @see docs/designs/lld-contextual-evidence-reporting.md
 */

const DEFAULT_HISTORY_WINDOW_DAYS = 180;

/**
 * @param historyWindowDays - Git history window length in days.
 * @returns Phrase like `6 months` or `90 days` for "in X before this PR" copy.
 */
export const describeHistoryWindowBeforePr = (
  historyWindowDays: number = DEFAULT_HISTORY_WINDOW_DAYS,
): string => {
  if (historyWindowDays === 180) {
    return "6 months";
  }
  if (historyWindowDays % 30 === 0 && historyWindowDays >= 30) {
    const monthCount = historyWindowDays / 30;
    return monthCount === 1 ? "1 month" : `${monthCount} months`;
  }
  return `${historyWindowDays} days`;
};
