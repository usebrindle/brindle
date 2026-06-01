/**
 * Options shape for the `diff_size` criterion (YAML `criteria.diff_size.options`).
 *
 * Lives beside {@link ./diffSize.js} but not inside it, so the criterion file stays runtime-only.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 * @see docs/adrs/0004-pure-criteria-over-hydrated-context.md
 */
export type DiffSizeOptions = {
  /**
   * Total added+deleted lines at which this criterion reaches raw score 100.
   * Must be a positive finite number when set.
   */
  max_lines_for_cap?: number;
};
