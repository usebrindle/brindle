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

const clampScore = (n: number): number => Math.min(100, Math.max(0, n));

const thresholdsAreInvalid = (t: ScoringConfig["thresholds"]): boolean => {
  const { low, medium } = t;
  return (
    !Number.isFinite(low) ||
    !Number.isFinite(medium) ||
    low < 0 ||
    medium > 100 ||
    low >= medium
  );
};

const assertValidThresholds = (t: ScoringConfig["thresholds"]): void => {
  if (thresholdsAreInvalid(t)) {
    const { low, medium } = t;
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

type ActiveCriterion = {
  id: string;
  criterion: Criterion;
  configWeight: number;
  options: unknown;
  evaluated: CriterionResult;
};

type CriterionResolution =
  | { type: "omit" }
  | { type: "disabled"; id: string }
  | { type: "active"; active: ActiveCriterion };

const sortedCriterionIds = (criteria: ScoringConfig["criteria"]): string[] =>
  Object.keys(criteria).sort((a, b) => a.localeCompare(b));

type CriterionGate = "omit" | "disabled" | "continue";

const criterionGate = (
  context: PRContext,
  entry: CriterionConfiguration | undefined,
  impl: Criterion | undefined,
): CriterionGate => {
  if (entry === undefined) return "omit";
  if (entry.enabled === false) return "disabled";
  if (impl === undefined) return "disabled";
  if (impl.isEnabled && !impl.isEnabled(context, entry.options)) return "disabled";
  return "continue";
};

const toActiveCriterion = (
  id: string,
  impl: Criterion,
  entry: CriterionConfiguration,
  evaluated: CriterionResult,
): ActiveCriterion => ({
  id,
  criterion: impl,
  configWeight: entry.weight,
  options: entry.options,
  evaluated,
});

const buildActiveOrDisabled = (
  id: string,
  context: PRContext,
  entry: CriterionConfiguration,
  impl: Criterion,
): CriterionResolution => {
  const evaluated = impl.evaluate(context, entry.options);
  if (evaluated.selfDisable === true) return { type: "disabled", id };
  return { type: "active", active: toActiveCriterion(id, impl, entry, evaluated) };
};

const resolveOneCriterion = (
  id: string,
  context: PRContext,
  entry: CriterionConfiguration | undefined,
  impl: Criterion | undefined,
): CriterionResolution => {
  const gate = criterionGate(context, entry, impl);
  if (gate === "omit") return { type: "omit" };
  if (gate === "disabled") return { type: "disabled", id };
  return buildActiveOrDisabled(id, context, entry!, impl!);
};

const applyCriterionResolution = (
  res: CriterionResolution,
  actives: ActiveCriterion[],
  disabled: string[],
): void => {
  if (res.type === "omit") return;
  if (res.type === "disabled") disabled.push(res.id);
  else actives.push(res.active);
};

const accumulateForCriterionId = (
  id: string,
  context: PRContext,
  config: ScoringConfig,
  criteria: Record<string, Criterion>,
  actives: ActiveCriterion[],
  disabled: string[],
): void => {
  const res = resolveOneCriterion(id, context, config.criteria[id], criteria[id]);
  applyCriterionResolution(res, actives, disabled);
};

const collectActiveCriteria = (
  context: PRContext,
  config: ScoringConfig,
  criteria: Record<string, Criterion>,
): { actives: ActiveCriterion[]; disabledCriteria: string[] } => {
  const disabledCriteria: string[] = [];
  const actives: ActiveCriterion[] = [];
  for (const id of sortedCriterionIds(config.criteria)) {
    accumulateForCriterionId(id, context, config, criteria, actives, disabledCriteria);
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

type WeightedParts = {
  raw: number;
  normalizedWeight: number;
  weighted: number;
  evaluated: CriterionResult;
};

const weightedPartsForActive = (a: ActiveCriterion, weightSum: number): WeightedParts => {
  const { evaluated } = a;
  const raw = clampScore(evaluated.score);
  const normalizedWeight = (a.configWeight * 100) / weightSum;
  const weighted = raw * (normalizedWeight / 100);
  return { raw, normalizedWeight, weighted, evaluated };
};

const toBreakdownRow = (a: ActiveCriterion, parts: WeightedParts): CriterionBreakdown => ({
  name: a.criterion.name,
  score: parts.raw,
  weight: parts.normalizedWeight,
  weighted: parts.weighted,
  justification: parts.evaluated.justification,
  detail: parts.evaluated.detail,
});

const appendOneBreakdownRow = (
  a: ActiveCriterion,
  weightSum: number,
  breakdown: CriterionBreakdown[],
): number => {
  const parts = weightedPartsForActive(a, weightSum);
  breakdown.push(toBreakdownRow(a, parts));
  return parts.weighted;
};

const computeBreakdown = (
  actives: ActiveCriterion[],
  weightSum: number,
): { breakdown: CriterionBreakdown[]; baseScore: number } => {
  const breakdown: CriterionBreakdown[] = [];
  let baseScore = 0;
  for (const a of actives) baseScore += appendOneBreakdownRow(a, weightSum, breakdown);
  return { breakdown, baseScore };
};

const sortedMutatorEntries = (
  mutatorConfig: ScoringConfig["mutators"],
): [string, MutatorConfiguration][] =>
  Object.entries(mutatorConfig ?? {}).sort(([a], [b]) => a.localeCompare(b)) as [
    string,
    MutatorConfiguration,
  ][];

const assertValidMutatorFactor = (id: string, factor: number): void => {
  if (Number.isFinite(factor) && factor > 0) return;
  throw new Error(`Mutator "${id}" returned invalid factor: ${String(factor)}`);
};

type MutatorApplyResult = { nextScore: number; didApply: boolean };

const applyOneMutatorEntry = (
  id: string,
  mcfg: MutatorConfiguration,
  impl: Mutator | undefined,
  context: PRContext,
  running: number,
): MutatorApplyResult => {
  if (mcfg.enabled === false || impl === undefined) return { nextScore: running, didApply: false };
  const factor = impl.apply(context, mcfg.options);
  if (factor === null) return { nextScore: running, didApply: false };
  assertValidMutatorFactor(id, factor);
  return { nextScore: clampScore(running * factor), didApply: true };
};

const foldOneMutatorEntry = (
  id: string,
  mcfg: MutatorConfiguration,
  mutators: Record<string, Mutator>,
  context: PRContext,
  running: number,
  appliedIds: string[],
): number => {
  const impl = mutators[id];
  const { nextScore, didApply } = applyOneMutatorEntry(id, mcfg, impl, context, running);
  if (didApply) appliedIds.push(id);
  return nextScore;
};

const applyMutators = (
  context: PRContext,
  baseScore: number,
  mutatorConfig: ScoringConfig["mutators"],
  mutators: Record<string, Mutator>,
): { score: number; mutatorsApplied: string[] } => {
  let running = clampScore(baseScore);
  const mutatorsApplied: string[] = [];
  for (const [id, mcfg] of sortedMutatorEntries(mutatorConfig)) {
    running = foldOneMutatorEntry(id, mcfg, mutators, context, running, mutatorsApplied);
  }
  mutatorsApplied.sort((a, b) => a.localeCompare(b));
  return { score: running, mutatorsApplied };
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
  const weightSum = actives.reduce((sum, a) => sum + a.configWeight, 0);
  requirePositiveWeightSum(weightSum);
  actives.sort((a, b) => a.id.localeCompare(b.id));
  const { breakdown, baseScore } = computeBreakdown(actives, weightSum);
  const applied = applyMutators(context, baseScore, config.mutators, mutators);
  return { breakdown, score: applied.score, mutatorsApplied: applied.mutatorsApplied };
};

const finalizeScoreResult = (
  partial: Pick<ScoreResult, "score" | "breakdown" | "mutatorsApplied">,
  thresholds: ScoringConfig["thresholds"],
  disabledCriteria: string[],
): ScoreResult => ({
  score: partial.score,
  tier: tierForScore(partial.score, thresholds),
  breakdown: partial.breakdown,
  mutatorsApplied: partial.mutatorsApplied,
  disabledCriteria,
});

/**
 * Score a change using the built-in criterion and mutator registries (initially empty; filled in later slices).
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
