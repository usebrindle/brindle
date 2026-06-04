/**
 * Typed options for the built-in `author_seniority` criterion (team-defined login tiers over {@link PRContext.author}).
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 */
export type AuthorSeniorityRule = {
  /** Platform login as produced by the adapter (compared case-insensitively). */
  login: string;
  /**
   * Raw risk contribution when {@link PRContext.author} matches this login after normalization.
   * When several rules match the same author, the configured aggregation applies (MVP: max).
   */
  score: number;
};

export type AuthorSeniorityCriterionOptions = {
  /** Ordered rules; each login is compared to {@link PRContext.author}. */
  rules?: AuthorSeniorityRule[];
  /**
   * Raw score 0–100 when the author does not match any rule (typical: higher risk for unknown authors).
   * Omitted or invalid values are treated as 0 at runtime until validated by schema in a later slice.
   */
  default_score?: number;
  /**
   * How to combine scores from rules that match the same author (e.g. duplicate login rows).
   * Only `max` is implemented; others are reserved for forward compatibility.
   */
  aggregation?: "max";
};
