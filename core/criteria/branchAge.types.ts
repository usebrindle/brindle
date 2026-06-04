/**
 * Options shape for the `branch_age` criterion (YAML `criteria.branch_age.options`).
 *
 * Lives beside {@link ./branchAge.js} but not inside it, so the criterion file stays runtime-only.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 * @see docs/adrs/0004-pure-criteria-over-hydrated-context.md
 */
export type BranchAgeCriterionOptions = {
  /**
   * Head commit age in whole hours at which this criterion reaches raw score 100.
   * Age is `classifiedAtIso` minus `headCommitCommittedAtIso` (platform-hydrated instants).
   * Must be a positive finite number when set.
   */
  max_age_hours_for_cap?: number;
};
