/**
 * Percent display for contextual evidence copy.
 */

/**
 * @param share - Fraction 0–1 from analyzer signals.
 * @returns Whole-number percent string (e.g. `62%`).
 */
export const formatPercentForDisplay = (share: number): string =>
  `${Math.round(share * 100)}%`;
