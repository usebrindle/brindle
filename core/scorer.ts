/**
 * Pure merge-risk scoring: resolve criteria, normalize weights, apply mutators, map to tier.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 * @see docs/adrs/0004-pure-criteria-over-hydrated-context.md
 */
import { builtInCriteria } from "./criteria/builtins.js";
import { builtInMutators } from "./mutators/builtins.js";
import {
  TRUSTED_PLUGIN_CRITERION_ID_PREFIX,
  type TrustedPluginsScoringArtifacts,
} from "./plugins/loadTrustedPlugins.js";
import {
  buildDeclarativeRuleCriteriaMap,
  DECLARATIVE_CRITERION_ID_PREFIX,
} from "./rules/declarativeRule.js";
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

const sortedDeclarativeCriterionIds = (config: ScoringConfig): string[] => {
  const declarativeRules = config.declarative_rules;
  if (declarativeRules === undefined) return [];
  return Object.keys(declarativeRules)
    .sort((leftRuleId, rightRuleId) => leftRuleId.localeCompare(rightRuleId))
    .map((declarativeRuleId) => `${DECLARATIVE_CRITERION_ID_PREFIX}${declarativeRuleId}`);
};

const sortedTrustedPluginCriterionIds = (
  trustedPluginCriteria: Record<string, Criterion> | undefined,
): string[] => {
  if (trustedPluginCriteria === undefined) return [];
  return Object.keys(trustedPluginCriteria).sort((leftCriterionId, rightCriterionId) =>
    leftCriterionId.localeCompare(rightCriterionId),
  );
};

/**
 * Built-in `criteria` keys first (sorted), then declarative rules (sorted), then trusted plugins (sorted),
 * each with their respective id prefixes.
 */
const sortedAllCriterionIds = (
  config: ScoringConfig,
  trustedPluginCriteria: Record<string, Criterion> | undefined,
): string[] => [
  ...sortedCriterionIds(config.criteria),
  ...sortedDeclarativeCriterionIds(config),
  ...sortedTrustedPluginCriterionIds(trustedPluginCriteria),
];

const getCriterionConfiguration = (
  config: ScoringConfig,
  criterionId: string,
  trustedPluginCriterionConfigurations: Record<string, CriterionConfiguration> | undefined,
): CriterionConfiguration | undefined => {
  if (criterionId.startsWith(DECLARATIVE_CRITERION_ID_PREFIX)) {
    const declarativeRuleId = criterionId.slice(DECLARATIVE_CRITERION_ID_PREFIX.length);
    return config.declarative_rules?.[declarativeRuleId];
  }
  if (criterionId.startsWith(TRUSTED_PLUGIN_CRITERION_ID_PREFIX)) {
    return trustedPluginCriterionConfigurations?.[criterionId];
  }
  return config.criteria[criterionId];
};

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

/**
 * Merges root-level `services` into evaluate options for `service_criticality` (ADR 0009); validated YAML keeps
 * `services` at the document root only.
 */
const mergeOptionsForCriterionEvaluation = (
  criterionId: string,
  config: ScoringConfig,
  options: unknown,
): unknown => {
  if (criterionId !== "service_criticality") return options;
  if (config.services === undefined) return options;
  const baseRecord =
    options !== null && options !== undefined && typeof options === "object" && !Array.isArray(options)
      ? { ...(options as Record<string, unknown>) }
      : {};
  return { ...baseRecord, services: config.services };
};

/**
 * Merges root-level `services` into mutator apply options for `critical_service` (ADR 0009), mirroring
 * {@link mergeOptionsForCriterionEvaluation} for `service_criticality`.
 */
const mergeOptionsForMutatorApplication = (
  mutatorId: string,
  config: ScoringConfig,
  options: unknown,
): unknown => {
  if (mutatorId !== "critical_service") return options;
  if (config.services === undefined) return options;
  const baseRecord =
    options !== null && options !== undefined && typeof options === "object" && !Array.isArray(options)
      ? { ...(options as Record<string, unknown>) }
      : {};
  return { ...baseRecord, services: config.services };
};

const buildActiveOrDisabled = (
  criterionId: string,
  context: PRContext,
  config: ScoringConfig,
  criterionConfiguration: CriterionConfiguration,
  criterionImplementation: Criterion,
): CriterionResolution => {
  const evaluateOptions = mergeOptionsForCriterionEvaluation(
    criterionId,
    config,
    criterionConfiguration.options,
  );
  const evaluated = criterionImplementation.evaluate(context, evaluateOptions);
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
  config: ScoringConfig,
  criterionConfiguration: CriterionConfiguration | undefined,
  criterionImplementation: Criterion | undefined,
): CriterionResolution => {
  const gate = criterionGate(context, criterionConfiguration, criterionImplementation);
  if (gate === "omit") return { type: "omit" };
  if (gate === "disabled") return { type: "disabled", id: criterionId };
  return buildActiveOrDisabled(
    criterionId,
    context,
    config,
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
  trustedPluginCriterionConfigurations: Record<string, CriterionConfiguration> | undefined,
  activeCriteria: ActiveCriterion[],
  disabledCriterionIds: string[],
): void => {
  const criterionResolution = resolveOneCriterion(
    criterionId,
    context,
    config,
    getCriterionConfiguration(config, criterionId, trustedPluginCriterionConfigurations),
    criteria[criterionId],
  );
  applyCriterionResolution(criterionResolution, activeCriteria, disabledCriterionIds);
};

const collectActiveCriteria = (
  context: PRContext,
  config: ScoringConfig,
  criteria: Record<string, Criterion>,
  trustedPluginCriteria: Record<string, Criterion> | undefined,
  trustedPluginCriterionConfigurations: Record<string, CriterionConfiguration> | undefined,
): { actives: ActiveCriterion[]; disabledCriteria: string[] } => {
  const disabledCriteria: string[] = [];
  const actives: ActiveCriterion[] = [];
  for (const criterionId of sortedAllCriterionIds(config, trustedPluginCriteria)) {
    accumulateForCriterionId(
      criterionId,
      context,
      config,
      criteria,
      trustedPluginCriterionConfigurations,
      actives,
      disabledCriteria,
    );
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
  scoringConfig: ScoringConfig,
): MutatorApplyResult => {
  if (mutatorConfiguration.enabled === false || mutatorImplementation === undefined) {
    return { nextScore: runningScore, didApply: false };
  }
  const mergedOptions = mergeOptionsForMutatorApplication(
    mutatorId,
    scoringConfig,
    mutatorConfiguration.options,
  );
  const factor = mutatorImplementation.apply(context, mergedOptions);
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
  scoringConfig: ScoringConfig,
): number => {
  const mutatorImplementation = mutators[mutatorId];
  const { nextScore, didApply } = applyOneMutatorEntry(
    mutatorId,
    mutatorConfiguration,
    mutatorImplementation,
    context,
    runningScore,
    scoringConfig,
  );
  if (didApply) appliedMutatorIds.push(mutatorId);
  return nextScore;
};

const applyMutators = (
  context: PRContext,
  baseScore: number,
  scoringConfig: ScoringConfig,
  mutators: Record<string, Mutator>,
): { score: number; mutatorsApplied: string[] } => {
  let runningScore = clampScore(baseScore);
  const mutatorsApplied: string[] = [];
  const mutatorConfig = scoringConfig.mutators;
  for (const [mutatorId, mutatorConfiguration] of sortedMutatorEntries(mutatorConfig)) {
    runningScore = foldOneMutatorEntry(
      mutatorId,
      mutatorConfiguration,
      mutators,
      context,
      runningScore,
      mutatorsApplied,
      scoringConfig,
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
  const mutatorPass = applyMutators(context, baseScore, config, mutators);
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
 * Score a change using the built-in criterion and mutator registries (`criteria` / `mutators` grow per slice).
 *
 * @param context - Platform-neutral change data produced by an adapter.
 * @param config - Weights, thresholds, and mutator ids (full schema validation comes in a later slice).
 * @param trustedPluginsArtifacts - Optional trusted plugins produced by {@link import("./plugins/loadTrustedPlugins.js").loadTrustedPlugins} (base-branch file bodies); omitted when not used.
 * @returns Aggregated score, tier, per-criterion breakdown, and mutator ids that ran.
 */
export const score = (
  context: PRContext,
  config: ScoringConfig,
  trustedPluginsArtifacts?: TrustedPluginsScoringArtifacts,
): ScoreResult => scoreWithRegistries(context, config, builtInCriteria, builtInMutators, trustedPluginsArtifacts);

/**
 * Score with explicit registries (used by tests and adapter wiring).
 *
 * Declarative rules from `config.declarative_rules` are always merged into the criterion registry
 * (keys `declarative:<ruleId>`) in addition to the `criteria` argument. Trusted plugins from
 * `trustedPluginsArtifacts` merge after declarative (keys `plugin:<normalizedPath>`).
 *
 * @param context - Platform-neutral change data.
 * @param config - Weights and thresholds.
 * @param criteria - Built-in (or test) implementations keyed like `config.criteria`.
 * @param mutators - Implementations keyed like `config.mutators`.
 * @param trustedPluginsArtifacts - Optional criteria + configurations from {@link import("./plugins/loadTrustedPlugins.js").loadTrustedPlugins}.
 * @returns Same shape as {@link score}.
 */
export const scoreWithRegistries = (
  context: PRContext,
  config: ScoringConfig,
  criteria: Record<string, Criterion>,
  mutators: Record<string, Mutator>,
  trustedPluginsArtifacts?: TrustedPluginsScoringArtifacts,
): ScoreResult => {
  assertValidThresholds(config.thresholds);
  const mergedCriteria: Record<string, Criterion> = {
    ...criteria,
    ...buildDeclarativeRuleCriteriaMap(config),
  };
  if (trustedPluginsArtifacts !== undefined) {
    Object.assign(mergedCriteria, trustedPluginsArtifacts.criteria);
  }
  const { actives, disabledCriteria } = collectActiveCriteria(
    context,
    config,
    mergedCriteria,
    trustedPluginsArtifacts?.criteria,
    trustedPluginsArtifacts?.criterionConfigurations,
  );
  if (actives.length === 0) return emptyScoreResult(config.thresholds, disabledCriteria);
  return finalizeScoreResult(
    scoreActiveSubset(context, actives, config, mutators),
    config.thresholds,
    disabledCriteria,
  );
};
