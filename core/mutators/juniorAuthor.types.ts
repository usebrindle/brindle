/**
 * YAML options for the built-in `junior_author` mutator (`mutators.junior_author.options`).
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 */
export type JuniorAuthorMutatorOptions = {
  /** Logins that trigger the multiplier when they match {@link import("../types.js").PRContext.author}. */
  logins: string[];
  /** Strictly multiplicative factor applied when the author matches (must be > 1). */
  multiplier: number;
};
