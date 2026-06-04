/**
 * Typed options for the built-in `file_patterns` criterion (globs over {@link PRContext.files} paths).
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 */
export type FilePatternRule = {
  /** Repository-root-relative glob (micromatch), e.g. recursive `*.sql` or `src/auth/**`. */
  glob: string;
  /**
   * Raw risk contribution when at least one changed file path matches this glob.
   * Final raw score for the criterion is the configured aggregation across matching rules (MVP: max).
   */
  score: number;
};

export type FilePatternsCriterionOptions = {
  /** Ordered rules; each glob is tested against every changed file path. */
  patterns?: FilePatternRule[];
  /**
   * How to combine scores from rules that matched at least one path.
   * Only `max` is implemented; others are reserved for forward compatibility.
   */
  aggregation?: "max";
};
