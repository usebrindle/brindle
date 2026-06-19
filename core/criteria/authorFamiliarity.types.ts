/**
 * Typed options for the built-in `author_familiarity` criterion.
 *
 * @see docs/designs/lld-author-familiarity-criterion.md
 */
import type { ContextualCharacterization } from "../contextual/contextual.types.js";

/** Raw risk score for a per-file familiarity characterization tier. */
export type AuthorFamiliarityCharacterizationScores = Record<ContextualCharacterization, number>;

export type AuthorFamiliarityCriterionOptions = {
  /** Git history window for hydration; not read during pure criterion evaluation. */
  history_window_days?: number;
  /**
   * How to combine per-file characterizations into one raw score.
   * Only `max` (worst file wins) is implemented in v1.
   */
  aggregation?: "max";
  /** Map each familiarity tier to a raw 0–100 score; higher = riskier. */
  characterization_scores?: Partial<AuthorFamiliarityCharacterizationScores>;
  /** Optional author email overrides for hydration; not read during pure criterion evaluation. */
  author_emails?: readonly string[];
};
