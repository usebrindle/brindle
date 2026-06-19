/**
 * Typed options for the built-in `blast_radius` criterion.
 *
 * @see docs/designs/lld-blast-radius-criterion.md
 */
import type { BlastRadiusCharacterization } from "../contextual/contextual.types.js";
import type { BlastRadiusThresholds } from "../contextual/blastRadius.types.js";

/** Raw risk score for a per-file blast-radius characterization tier. */
export type BlastRadiusCharacterizationScores = Record<BlastRadiusCharacterization, number>;

export type BlastRadiusCriterionOptions = {
  /**
   * How to combine per-file characterizations into one raw score.
   * Only `max` (worst file wins) is implemented in v1.
   */
  aggregation?: "max";
  /** Map each reach tier to a raw 0–100 score; higher = riskier. */
  characterization_scores?: Partial<BlastRadiusCharacterizationScores>;
  /** Subset of extractor ids for hydration; not read during pure criterion evaluation. */
  enabled_extractors?: readonly string[];
  /** Transitive-reach cut points for hydration; not read during pure criterion evaluation. */
  thresholds?: Partial<BlastRadiusThresholds>;
};
