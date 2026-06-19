/**
 * Built-in `blast_radius` criterion (runtime only). Options types live in {@link ./blastRadius.types.js}.
 *
 * @see docs/designs/lld-blast-radius-criterion.md
 * @see docs/adrs/0004-pure-criteria-over-hydrated-context.md
 */
import type { BlastRadiusCharacterization, BlastRadiusFinding } from "../contextual/contextual.types.js";
import { normalizeForwardSlashes } from "../contextual/pathNormalize.js";
import type { Criterion, CriterionResult, PRContext } from "../types.js";

import type {
  BlastRadiusCharacterizationScores,
  BlastRadiusCriterionOptions,
} from "./blastRadius.types.js";

const DEFAULT_CHARACTERIZATION_SCORES: BlastRadiusCharacterizationScores = {
  isolated: 20,
  moderate: 55,
  broad: 90,
};

const CHARACTERIZATION_RISK_ORDER: readonly BlastRadiusCharacterization[] = ["broad", "moderate", "isolated"];

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
 * @param options - `criteria.blast_radius.options` from config; validated in a later schema slice.
 * @returns Merged characterization scores with defaults for missing tiers.
 */
const characterizationScoresFromOptions = (options: unknown): BlastRadiusCharacterizationScores => {
  if (options === null || options === undefined || typeof options !== "object" || Array.isArray(options)) {
    return { ...DEFAULT_CHARACTERIZATION_SCORES };
  }
  const record = options as BlastRadiusCriterionOptions;
  const rawScores = record.characterization_scores;
  if (rawScores === null || rawScores === undefined || typeof rawScores !== "object" || Array.isArray(rawScores)) {
    return { ...DEFAULT_CHARACTERIZATION_SCORES };
  }
  return {
    isolated: clampScore(rawScores.isolated) ?? DEFAULT_CHARACTERIZATION_SCORES.isolated,
    moderate: clampScore(rawScores.moderate) ?? DEFAULT_CHARACTERIZATION_SCORES.moderate,
    broad: clampScore(rawScores.broad) ?? DEFAULT_CHARACTERIZATION_SCORES.broad,
  };
};

/**
 * @param finding - Single per-file blast-radius finding.
 * @param characterizationScores - Tier → raw score map.
 * @returns Raw score for the finding's characterization tier.
 */
const scoreForFinding = (
  finding: BlastRadiusFinding,
  characterizationScores: BlastRadiusCharacterizationScores,
): number => characterizationScores[finding.characterization];

/**
 * @param leftFinding - Candidate worst finding.
 * @param rightFinding - Another finding to compare.
 * @param characterizationScores - Tier → raw score map.
 * @returns The finding with the higher raw risk score (broadest reach wins).
 */
const pickWorseFinding = (
  leftFinding: BlastRadiusFinding,
  rightFinding: BlastRadiusFinding,
  characterizationScores: BlastRadiusCharacterizationScores,
): BlastRadiusFinding =>
  scoreForFinding(rightFinding, characterizationScores) > scoreForFinding(leftFinding, characterizationScores)
    ? rightFinding
    : leftFinding;

/**
 * @param leftFinding - Candidate worst finding.
 * @param rightFinding - Another finding with the same raw score.
 * @returns Tie-breaker: prefer `broad`, then `moderate`, then transitive reach, then path order.
 */
const pickFindingOnTie = (leftFinding: BlastRadiusFinding, rightFinding: BlastRadiusFinding): BlastRadiusFinding => {
  const leftRiskIndex = CHARACTERIZATION_RISK_ORDER.indexOf(leftFinding.characterization);
  const rightRiskIndex = CHARACTERIZATION_RISK_ORDER.indexOf(rightFinding.characterization);
  if (rightRiskIndex < leftRiskIndex) {
    return rightFinding;
  }
  if (leftRiskIndex < rightRiskIndex) {
    return leftFinding;
  }
  if (rightFinding.transitiveReachCount !== leftFinding.transitiveReachCount) {
    return rightFinding.transitiveReachCount > leftFinding.transitiveReachCount ? rightFinding : leftFinding;
  }
  return rightFinding.changedFile.localeCompare(leftFinding.changedFile) < 0 ? rightFinding : leftFinding;
};

/**
 * @param findings - Pre-computed blast-radius findings from hydration.
 * @param characterizationScores - Tier → raw score map.
 * @returns Worst finding by max aggregation (highest raw score).
 */
const worstFindingByMaxAggregation = (
  findings: readonly BlastRadiusFinding[],
  characterizationScores: BlastRadiusCharacterizationScores,
): BlastRadiusFinding | null => {
  if (findings.length === 0) {
    return null;
  }
  let worstFinding = findings[0];
  for (let index = 1; index < findings.length; index += 1) {
    const candidateFinding = findings[index];
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
 * @param context - Hydrated change context.
 * @returns Whether every changed file was skipped for blast-radius analysis.
 */
const allChangedFilesUnsupportedForBlastRadius = (context: PRContext): boolean => {
  if (context.files.length === 0) {
    return false;
  }
  const notAnalyzedPaths = new Set(
    (context.contextualEvidence?.notAnalyzedForBlastRadius ?? []).map((entry) =>
      normalizeForwardSlashes(entry.path),
    ),
  );
  return context.files.every((changedFile) => notAnalyzedPaths.has(normalizeForwardSlashes(changedFile.path)));
};

/**
 * @param worstFinding - Aggregated worst blast-radius finding.
 * @returns Human-readable justification for the score breakdown.
 */
const justificationForWorstFinding = (worstFinding: BlastRadiusFinding): string =>
  `Broadest reach: ${worstFinding.transitiveReachCount} files transitively on \`${worstFinding.changedFile}\` (see Contextual evidence).`;

/**
 * Criterion registered under YAML key `blast_radius`. Scores from pre-hydrated blast-radius findings.
 */
export const blastRadiusCriterion: Criterion = {
  name: "Blast radius",
  /**
   * @param context - Hydrated {@link PRContext}; reads `contextualEvidence.blastRadiusFindings`.
   * @param options - Parsed `criteria.blast_radius.options` (see {@link ./blastRadius.types.js}).
   * @returns Raw score 0–100 from max of per-file characterization scores (worst file wins).
   */
  evaluate: (context: PRContext, options: unknown): CriterionResult => {
    const notAnalyzed = [...(context.contextualEvidence?.notAnalyzedForBlastRadius ?? [])];

    if (context.files.length === 0) {
      return {
        score: 0,
        justification: "No changed files.",
        detail: {
          worstFile: null,
          worstCharacterization: null,
          transitiveReach: null,
          findingCount: 0,
          findings: [] as BlastRadiusFinding[],
          notAnalyzed,
        },
      };
    }

    if (allChangedFilesUnsupportedForBlastRadius(context)) {
      return {
        score: 0,
        justification: "No analyzable changed files for blast radius.",
        selfDisable: true,
        detail: {
          worstFile: null,
          worstCharacterization: null,
          transitiveReach: null,
          findingCount: 0,
          findings: [] as BlastRadiusFinding[],
          notAnalyzed,
        },
      };
    }

    const findings = context.contextualEvidence?.blastRadiusFindings ?? [];
    const characterizationScores = characterizationScoresFromOptions(options);

    if (findings.length === 0) {
      return {
        score: 0,
        justification: "No blast radius findings on context.",
        detail: {
          worstFile: null,
          worstCharacterization: null,
          transitiveReach: null,
          findingCount: 0,
          findings: [] as BlastRadiusFinding[],
          notAnalyzed,
        },
      };
    }

    const worstFinding = worstFindingByMaxAggregation(findings, characterizationScores);
    if (worstFinding === null) {
      return {
        score: 0,
        justification: "No blast radius findings on context.",
        detail: {
          worstFile: null,
          worstCharacterization: null,
          transitiveReach: null,
          findingCount: 0,
          findings: [] as BlastRadiusFinding[],
          notAnalyzed,
        },
      };
    }

    const rawScore = scoreForFinding(worstFinding, characterizationScores);
    return {
      score: rawScore,
      justification: justificationForWorstFinding(worstFinding),
      detail: {
        worstFile: worstFinding.changedFile,
        worstCharacterization: worstFinding.characterization,
        transitiveReach: worstFinding.transitiveReachCount,
        findingCount: findings.length,
        findings: [...findings],
        notAnalyzed,
      },
    };
  },
};
