/**
 * Formats dates for git `--since` arguments.
 */
const padTwoDigits = (value: number): string => value.toString().padStart(2, "0");

/**
 * @param since - Inclusive lower bound for git history/blame windows.
 * @returns ISO-like date string accepted by git `--since`.
 */
export const formatGitSinceDate = (since: Date): string => {
  const year = since.getUTCFullYear();
  const month = padTwoDigits(since.getUTCMonth() + 1);
  const day = padTwoDigits(since.getUTCDate());
  return `${year}-${month}-${day}`;
};
