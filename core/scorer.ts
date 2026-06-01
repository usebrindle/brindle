/**
 * Pure merge-risk scoring: resolve criteria, normalize weights, apply mutators, map to tier.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 * @see docs/adrs/0004-pure-criteria-over-hydrated-context.md
 */
import { builtInCriteria } from "./criteria/builtins.js";
import { builtInMutators } from "./mutators/builtins.js";
import type {
  Criterion,
  CriterionBreakdown,
  CriterionConfiguration,
  CriterionResult,
  Mutator,
  MutatorConfiguration,
  PRContext,
  ScoreResult,
  ScoringConfig,
} from "./types.js";
import type {
  ActiveCriterion,
  CriterionGate,
  CriterionResolution,
  MutatorApplyResult,
  WeightedParts,
} from "./scorer.types.js";

const clampScore = (scoreValue: number): number =>
  Math.min(100, Math.max(0, scoreValue));

const thresholdsAreInvalid = (thresholds: ScoringConfig["thresholds"]): boolean => {
  const { low, medium } = thresholds;
  return (
    !Number.isFinite(low) ||
    !Number.isFinite(medium) ||
    low < 0 ||
    medium > 100 ||
    low >= medium
  );
};

const assertValidThresholds = (thresholds: ScoringConfig["thresholds"]): void => {
  if (thresholdsAreInvalid(thresholds)) {
    const { low, medium } = thresholds;
    throw new Error(
      `Invalid thresholds: expected 0 <= low < medium <= 100, got low=${low}, medium=${medium}`,
    );
  }
};

const tierForScore = (
  value: number,
  thresholds: ScoringConfig["thresholds"],
): "LOW" | "MEDIUM" | "HIGH" => {
  if (value <= thresholds.low) return "LOW";
  if (value <= thresholds.medium) return "MEDIUM";
  return "HIGH";
};

const sortedCriterionIds = (criteria: ScoringConfig["criteria"]): string[] =>
  Object.keys(criteria).sort((leftCriterionId, rightCriterionId) =>
    leftCriterionId.localeCompare(rightCriterionId),
  );

const criterionGate = (
  context: PRContext,
  criterionConfiguration: CriterionConfiguration | undefined,
  criterionImplementation: Criterion | undefined,
): CriterionGate => {
  if (criterionConfiguration === undefined) return "omit";
  if (criterionConfiguration.enabled === false) return "disabled";
  if (criterionImplementation === undefined) return "disabled";
  if (
    criterionImplementation.isEnabled &&
    !criterionImplementation.isEnabled(context, criterionConfiguration.options)
  ) {
    return "disabled";
  }
  return "continue";
};

const toActiveCriterion = (
  criterionId: string,
  criterionImplementation: Criterion,
  criterionConfiguration: CriterionConfiguration,
  evaluated: CriterionResult,
): ActiveCriterion => ({
  id: criterionId,
  criterion: criterionImplementation,
  configWeight: criterionConfiguration.weight,
  options: criterionConfiguration.options,
  evaluated,
});

const buildActiveOrDisabled = (
  criterionId: string,
  context: PRContext,
  criterionConfiguration: CriterionConfiguration,
  criterionImplementation: Criterion,
): CriterionResolution => {
  const evaluated = criterionImplementation.evaluate(context, criterionConfiguration.options);
  if (evaluated.selfDisable === true) return { type: "disabled", id: criterionId };
  return {
    type: "active",
    active: toActiveCriterion(
      criterionId,
      criterionImplementation,
      criterionConfiguration,
      evaluated,
    ),
  };
};

const resolveOneCriterion = (
  criterionId: string,
  context: PRContext,
  criterionConfiguration: CriterionConfiguration | undefined,
  criterionImplementation: Criterion | undefined,
): CriterionResolution => {
  const gate = criterionGate(context, criterionConfiguration, criterionImplementation);
  if (gate === "omit") return { type: "omit" };
  if (gate === "disabled") return { type: "disabled", id: criterionId };
  return buildActiveOrDisabled(
    criterionId,
    context,
    criterionConfiguration!,
    criterionImplementation!,
  );
};

const applyCriterionResolution = (
  criterionResolution: CriterionResolution,
  activeCriteria: ActiveCriterion[],
  disabledCriterionIds: string[],
): void => {
  if (criterionResolution.type === "omit") return;
  if (criterionResolution.type === "disabled") disabledCriterionIds.push(criterionResolution.id);
  else activeCriteria.push(criterionResolution.active);
};

const accumulateForCriterionId = (
  criterionId: string,
  context: PRContext,
  config: ScoringConfig,
  criteria: Record<string, Criterion>,
  activeCriteria: ActiveCriterion[],
  disabledCriterionIds: string[],
): void => {
  const criterionResolution = resolveOneCriterion(
    criterionId,
    context,
    config.criteria[criterionId],
    criteria[criterionId],
  );
  applyCriterionResolution(criterionResolution, activeCriteria, disabledCriterionIds);
};

const collectActiveCriteria = (
  context: PRContext,
  config: ScoringConfig,
  criteria: Record<string, Criterion>,
): { actives: ActiveCriterion[]; disabledCriteria: string[] } => {
  const disabledCriteria: string[] = [];
  const actives: ActiveCriterion[] = [];
  for (const criterionId of sortedCriterionIds(config.criteria)) {
    accumulateForCriterionId(criterionId, context, config, criteria, actives, disabledCriteria);
  }
  return { actives, disabledCriteria };
};

const emptyScoreResult = (
  thresholds: ScoringConfig["thresholds"],
  disabledCriteria: string[],
): ScoreResult => ({
  score: 0,
  tier: tierForScore(0, thresholds),
  breakdown: [],
  mutatorsApplied: [],
  disabledCriteria,
});

const weightedPartsForActive = (
  activeCriterion: ActiveCriterion,
  weightSum: number,
): WeightedParts => {
  const { evaluated } = activeCriterion;
  const raw = clampScore(evaluated.score);
  const normalizedWeight = (activeCriterion.configWeight * 100) / weightSum;
  const weighted = raw * (normalizedWeight / 100);
  return { raw, normalizedWeight, weighted, evaluated };
};

const toBreakdownRow = (
  activeCriterion: ActiveCriterion,
  weightedParts: WeightedParts,
): CriterionBreakdown => ({
  name: activeCriterion.criterion.name,
  score: weightedParts.raw,
  weight: weightedParts.normalizedWeight,
  weighted: weightedParts.weighted,
  justification: weightedParts.evaluated.justification,
  detail: weightedParts.evaluated.detail,
});

const appendOneBreakdownRow = (
  activeCriterion: ActiveCriterion,
  weightSum: number,
  breakdown: CriterionBreakdown[],
): number => {
  const weightedParts = weightedPartsForActive(activeCriterion, weightSum);
  breakdown.push(toBreakdownRow(activeCriterion, weightedParts));
  return weightedParts.weighted;
};

const computeBreakdown = (
  actives: ActiveCriterion[],
  weightSum: number,
): { breakdown: CriterionBreakdown[]; baseScore: number } => {
  const breakdown: CriterionBreakdown[] = [];
  let baseScore = 0;
  for (const activeCriterion of actives) {
    baseScore += appendOneBreakdownRow(activeCriterion, weightSum, breakdown);
  }
  return { breakdown, baseScore };
};

const sortedMutatorEntries = (
  mutatorConfig: ScoringConfig["mutators"],
): [string, MutatorConfiguration][] => {
  const mutatorConfigurationsById: Record<string, MutatorConfiguration> = mutatorConfig ?? {};
  return Object.keys(mutatorConfigurationsById)
    .sort((leftMutatorId, rightMutatorId) => leftMutatorId.localeCompare(rightMutatorId))
    .map(
      (mutatorId): [string, MutatorConfiguration] => [
        mutatorId,
        mutatorConfigurationsById[mutatorId],
      ],
    );
};

const assertValidMutatorFactor = (mutatorId: string, factor: number): void => {
  if (Number.isFinite(factor) && factor > 0) return;
  throw new Error(`Mutator "${mutatorId}" returned invalid factor: ${String(factor)}`);
};

const applyOneMutatorEntry = (
  mutatorId: string,
  mutatorConfiguration: MutatorConfiguration,
  mutatorImplementation: Mutator | undefined,
  context: PRContext,
  runningScore: number,
): MutatorApplyResult => {
  if (mutatorConfiguration.enabled === false || mutatorImplementation === undefined) {
    return { nextScore: runningScore, didApply: false };
  }
  const factor = mutatorImplementation.apply(context, mutatorConfiguration.options);
  if (factor === null) return { nextScore: runningScore, didApply: false };
  assertValidMutatorFactor(mutatorId, factor);
  return { nextScore: clampScore(runningScore * factor), didApply: true };
};

const foldOneMutatorEntry = (
  mutatorId: string,
  mutatorConfiguration: MutatorConfiguration,
  mutators: Record<string, Mutator>,
  context: PRContext,
  runningScore: number,
  appliedMutatorIds: string[],
): number => {
  const mutatorImplementation = mutators[mutatorId];
  const { nextScore, didApply } = applyOneMutatorEntry(
    mutatorId,
    mutatorConfiguration,
    mutatorImplementation,
    context,
    runningScore,
  );
  if (didApply) appliedMutatorIds.push(mutatorId);
  return nextScore;
};

const applyMutators = (
  context: PRContext,
  baseScore: number,
  mutatorConfig: ScoringConfig["mutators"],
  mutators: Record<string, Mutator>,
): { score: number; mutatorsApplied: string[] } => {
  let runningScore = clampScore(baseScore);
  const mutatorsApplied: string[] = [];
  for (const [mutatorId, mutatorConfiguration] of sortedMutatorEntries(mutatorConfig)) {
    runningScore = foldOneMutatorEntry(
      mutatorId,
      mutatorConfiguration,
      mutators,
      context,
      runningScore,
      mutatorsApplied,
    );
  }
  mutatorsApplied.sort((leftMutatorId, rightMutatorId) =>
    leftMutatorId.localeCompare(rightMutatorId),
  );
  return { score: runningScore, mutatorsApplied };
};

const requirePositiveWeightSum = (weightSum: number): void => {
  if (weightSum > 0) return;
  throw new Error("Sum of active criterion weights must be positive");
};

const scoreActiveSubset = (
  context: PRContext,
  actives: ActiveCriterion[],
  config: ScoringConfig,
  mutators: Record<string, Mutator>,
): Pick<ScoreResult, "score" | "breakdown" | "mutatorsApplied"> => {
  const weightSum = actives.reduce(
    (runningWeightSum, activeCriterion) => runningWeightSum + activeCriterion.configWeight,
    0,
  );
  requirePositiveWeightSum(weightSum);
  actives.sort((leftActive, rightActive) => leftActive.id.localeCompare(rightActive.id));
  const { breakdown, baseScore } = computeBreakdown(actives, weightSum);
  const mutatorPass = applyMutators(context, baseScore, config.mutators, mutators);
  return {
    breakdown,
    score: mutatorPass.score,
    mutatorsApplied: mutatorPass.mutatorsApplied,
  };
};

const finalizeScoreResult = (
  partialScore: Pick<ScoreResult, "score" | "breakdown" | "mutatorsApplied">,
  thresholds: ScoringConfig["thresholds"],
  disabledCriteria: string[],
): ScoreResult => ({
  score: partialScore.score,
  tier: tierForScore(partialScore.score, thresholds),
  breakdown: partialScore.breakdown,
  mutatorsApplied: partialScore.mutatorsApplied,
  disabledCriteria,
});

/**
 * Score a change using the built-in criterion and mutator registries (`criteria` grows per slice; mutators stay empty until wired).
 *
 * @param context - Platform-neutral change data produced by an adapter.
 * @param config - Weights, thresholds, and mutator ids (full schema validation comes in a later slice).
 * @returns Aggregated score, tier, per-criterion breakdown, and mutator ids that ran.
 */
export const score = (context: PRContext, config: ScoringConfig): ScoreResult =>
  scoreWithRegistries(context, config, builtInCriteria, builtInMutators);

/**
 * Score with explicit registries (used by tests and future trusted-plugin wiring).
 *
 * @param context - Platform-neutral change data.
 * @param config - Weights and thresholds.
 * @param criteria - Implementations keyed like `config.criteria`.
 * @param mutators - Implementations keyed like `config.mutators`.
 * @returns Same shape as {@link score}.
 */
export const scoreWithRegistries = (
  context: PRContext,
  config: ScoringConfig,
  criteria: Record<string, Criterion>,
  mutators: Record<string, Mutator>,
): ScoreResult => {
  assertValidThresholds(config.thresholds);
  const { actives, disabledCriteria } = collectActiveCriteria(context, config, criteria);
  if (actives.length === 0) return emptyScoreResult(config.thresholds, disabledCriteria);
  return finalizeScoreResult(
    scoreActiveSubset(context, actives, config, mutators),
    config.thresholds,
    disabledCriteria,
  );
};
