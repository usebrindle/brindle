/**
 * Typed options for the built-in `test_coverage` criterion (Istanbul statement aggregates on {@link PRContext.coverage}).
 *
 * @see docs/adrs/0005-read-findings-not-run-tools.md
 */
export type TestCoverageCriterionOptions = {
  /**
   * Minimum acceptable coverage percent (0–100). At or above this value the raw criterion score is 0 (low risk).
   * Below it, score rises linearly toward 100 at 0% actual coverage.
   */
  minimum_percent?: number;
};
