/**
 * Built-in `author_familiarity` criterion (runtime only). Options types live in {@link ./authorFamiliarity.types.js}.
 *
 * @see docs/designs/lld-author-familiarity-criterion.md
 * @see docs/adrs/0004-pure-criteria-over-hydrated-context.md
 */
import type { ContextualCharacterization, FamiliarityFinding } from "../contextual/contextual.types.js";
import type { Criterion, CriterionResult, PRContext } from "../types.js";

import type {
  AuthorFamiliarityCharacterizationScores,
  AuthorFamiliarityCriterionOptions,
} from "./authorFamiliarity.types.js";

const DEFAULT_CHARACTERIZATION_SCORES: AuthorFamiliarityCharacterizationScores = {
  high: 15,
  moderate: 50,
  none: 85,
};

const CHARACTERIZATION_RISK_ORDER: readonly ContextualCharacterization[] = ["none", "moderate", "high"];

/**
 * @param scoreValue - Raw score from config.
 * @returns Clamped 0–100 score, or undefined when invalid.
 */
const clampScore = (scoreValue: unknown): number | undefined => {
  if (typeof scoreValue !== "number" || !Number.isFinite(scoreValue)) {
    return undefined;
  }
  return Math.min(100, Math.max(0, scoreValue));
};

/**
 * @param options - `criteria.author_familiarity.options` from config; validated in a later schema slice.
 * @returns Merged characterization scores with defaults for missing tiers.
 */
const characterizationScoresFromOptions = (options: unknown): AuthorFamiliarityCharacterizationScores => {
  if (options === null || options === undefined || typeof options !== "object" || Array.isArray(options)) {
    return { ...DEFAULT_CHARACTERIZATION_SCORES };
  }
  const record = options as AuthorFamiliarityCriterionOptions;
  const rawScores = record.characterization_scores;
  if (rawScores === null || rawScores === undefined || typeof rawScores !== "object" || Array.isArray(rawScores)) {
    return { ...DEFAULT_CHARACTERIZATION_SCORES };
  }
  return {
    high: clampScore(rawScores.high) ?? DEFAULT_CHARACTERIZATION_SCORES.high,
    moderate: clampScore(rawScores.moderate) ?? DEFAULT_CHARACTERIZATION_SCORES.moderate,
    none: clampScore(rawScores.none) ?? DEFAULT_CHARACTERIZATION_SCORES.none,
  };
};

/**
 * @param finding - Single per-file familiarity finding.
 * @param characterizationScores - Tier → raw score map.
 * @returns Raw score for the finding's characterization tier.
 */
const scoreForFinding = (
  finding: FamiliarityFinding,
  characterizationScores: AuthorFamiliarityCharacterizationScores,
): number => characterizationScores[finding.characterization];

/**
 * @param leftFinding - Candidate worst finding.
 * @param rightFinding - Another finding to compare.
 * @param characterizationScores - Tier → raw score map.
 * @returns The finding with the higher raw risk score (worst familiarity wins).
 */
const pickWorseFinding = (
  leftFinding: FamiliarityFinding,
  rightFinding: FamiliarityFinding,
  characterizationScores: AuthorFamiliarityCharacterizationScores,
): FamiliarityFinding =>
  scoreForFinding(rightFinding, characterizationScores) > scoreForFinding(leftFinding, characterizationScores)
    ? rightFinding
    : leftFinding;

/**
 * @param leftFinding - Candidate worst finding.
 * @param rightFinding - Another finding with the same raw score.
 * @returns Tie-breaker: prefer `none`, then `moderate`, then path lexicographic order.
 */
const pickFindingOnTie = (leftFinding: FamiliarityFinding, rightFinding: FamiliarityFinding): FamiliarityFinding => {
  const leftRiskIndex = CHARACTERIZATION_RISK_ORDER.indexOf(leftFinding.characterization);
  const rightRiskIndex = CHARACTERIZATION_RISK_ORDER.indexOf(rightFinding.characterization);
  if (rightRiskIndex < leftRiskIndex) {
    return rightFinding;
  }
  if (leftRiskIndex < rightRiskIndex) {
    return leftFinding;
  }
  return rightFinding.touchedFile.localeCompare(leftFinding.touchedFile) < 0 ? rightFinding : leftFinding;
};

/**
 * @param findings - Pre-computed familiarity findings from hydration.
 * @param characterizationScores - Tier → raw score map.
 * @returns Worst finding by max aggregation (highest raw score).
 */
const worstFindingByMaxAggregation = (
  findings: readonly FamiliarityFinding[],
  characterizationScores: AuthorFamiliarityCharacterizationScores,
): FamiliarityFinding | null => {
  if (findings.length === 0) {
    return null;
  }
  let worstFinding = findings[0]!;
  for (let index = 1; index < findings.length; index += 1) {
    const candidateFinding = findings[index]!;
    const worseByScore = pickWorseFinding(worstFinding, candidateFinding, characterizationScores);
    worstFinding =
      scoreForFinding(worseByScore, characterizationScores) ===
      scoreForFinding(worstFinding, characterizationScores)
        ? pickFindingOnTie(worstFinding, candidateFinding)
        : worseByScore;
  }
  return worstFinding;
};

/**
 * Criterion registered under YAML key `author_familiarity`. Scores from pre-hydrated familiarity findings.
 */
export const authorFamiliarityCriterion: Criterion = {
  name: "Author familiarity",
  /**
   * @param context - Hydrated {@link PRContext}; reads `contextualEvidence.familiarityFindings`.
   * @param options - Parsed `criteria.author_familiarity.options` (see {@link ./authorFamiliarity.types.js}).
   * @returns Raw score 0–100 from max of per-file characterization scores (worst file wins).
   */
  evaluate: (context: PRContext, options: unknown): CriterionResult => {
    if (context.files.length === 0) {
      return {
        score: 0,
        justification: "No changed files.",
        detail: { worstFile: null, worstCharacterization: null, findingCount: 0, findings: [] as FamiliarityFinding[] },
      };
    }

    const findings = context.contextualEvidence?.familiarityFindings ?? [];
    const characterizationScores = characterizationScoresFromOptions(options);

    if (findings.length === 0) {
      return {
        score: 0,
        justification: "No familiarity findings on context.",
        detail: { worstFile: null, worstCharacterization: null, findingCount: 0, findings: [] as FamiliarityFinding[] },
      };
    }

    const worstFinding = worstFindingByMaxAggregation(findings, characterizationScores);
    if (worstFinding === null) {
      return {
        score: 0,
        justification: "No familiarity findings on context.",
        detail: { worstFile: null, worstCharacterization: null, findingCount: 0, findings: [] as FamiliarityFinding[] },
      };
    }

    const rawScore = scoreForFinding(worstFinding, characterizationScores);
    return {
      score: rawScore,
      justification: `Lowest familiarity: ${worstFinding.characterization} on \`${worstFinding.touchedFile}\` (see Contextual evidence).`,
      detail: {
        worstFile: worstFinding.touchedFile,
        worstCharacterization: worstFinding.characterization,
        findingCount: findings.length,
        findings: [...findings],
      },
    };
  },
};
