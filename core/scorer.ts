import { builtInCriteria } from "./criteria/builtins.js";
import { builtInMutators } from "./mutators/builtins.js";
import type {
  Criterion,
  CriterionBreakdown,
  CriterionResult,
  Mutator,
  MutatorConfiguration,
  PRContext,
  ScoreResult,
  ScoringConfig,
} from "./types.js";

const clampScore = (n: number): number => Math.min(100, Math.max(0, n));

const assertValidThresholds = (t: ScoringConfig["thresholds"]): void => {
  const { low, medium } = t;
  if (
    !Number.isFinite(low) ||
    !Number.isFinite(medium) ||
    low < 0 ||
    medium > 100 ||
    low >= medium
  ) {
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

const sortedCriterionIds = (criteria: ScoringConfig["criteria"]): string[] =>
  Object.keys(criteria).sort((a, b) => a.localeCompare(b));

const collectActiveCriteria = (
  context: PRContext,
  config: ScoringConfig,
  criteria: Record<string, Criterion>,
): { actives: ActiveCriterion[]; disabledCriteria: string[] } => {
  const disabledCriteria: string[] = [];
  const actives: ActiveCriterion[] = [];

  for (const id of sortedCriterionIds(config.criteria)) {
    const entry = config.criteria[id];
    if (entry === undefined) continue;

    if (entry.enabled === false) {
      disabledCriteria.push(id);
      continue;
    }

    const impl = criteria[id];
    if (impl === undefined) {
      disabledCriteria.push(id);
      continue;
    }

    if (impl.isEnabled && !impl.isEnabled(context, entry.options)) {
      disabledCriteria.push(id);
      continue;
    }

    const evaluated = impl.evaluate(context, entry.options);
    if (evaluated.selfDisable === true) {
      disabledCriteria.push(id);
      continue;
    }

    actives.push({
      id,
      criterion: impl,
      configWeight: entry.weight,
      options: entry.options,
      evaluated,
    });
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

const computeBreakdown = (
  actives: ActiveCriterion[],
  weightSum: number,
): { breakdown: CriterionBreakdown[]; baseScore: number } => {
  const breakdown: CriterionBreakdown[] = [];
  let baseScore = 0;

  for (const a of actives) {
    const { evaluated } = a;
    const raw = clampScore(evaluated.score);
    const normalizedWeight = (a.configWeight * 100) / weightSum;
    const weighted = raw * (normalizedWeight / 100);
    baseScore += weighted;
    breakdown.push({
      name: a.criterion.name,
      score: raw,
      weight: normalizedWeight,
      weighted,
      justification: evaluated.justification,
      detail: evaluated.detail,
    });
  }

  return { breakdown, baseScore };
};

const applyMutators = (
  context: PRContext,
  baseScore: number,
  mutatorConfig: ScoringConfig["mutators"],
  mutators: Record<string, Mutator>,
): { score: number; mutatorsApplied: string[] } => {
  let running = clampScore(baseScore);
  const mutatorsApplied: string[] = [];

  const entries = Object.entries(mutatorConfig ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  ) as [string, MutatorConfiguration][];

  for (const [id, mcfg] of entries) {
    if (mcfg.enabled === false) continue;
    const impl = mutators[id];
    if (impl === undefined) continue;
    const factor = impl.apply(context, mcfg.options);
    if (factor === null) continue;
    if (!Number.isFinite(factor) || factor <= 0) {
      throw new Error(`Mutator "${id}" returned invalid factor: ${String(factor)}`);
    }
    running = clampScore(running * factor);
    mutatorsApplied.push(id);
  }

  mutatorsApplied.sort((a, b) => a.localeCompare(b));
  return { score: running, mutatorsApplied };
};

/**
 * Pure scoring engine. Same inputs always yield the same result shape.
 * @see docs/designs/lld-merge-risk-classifier.md
 */
export const score = (context: PRContext, config: ScoringConfig): ScoreResult =>
  scoreWithRegistries(context, config, builtInCriteria, builtInMutators);

/**
 * Like {@link score} but with explicit registries (tests and future plugin wiring).
 */
export const scoreWithRegistries = (
  context: PRContext,
  config: ScoringConfig,
  criteria: Record<string, Criterion>,
  mutators: Record<string, Mutator>,
): ScoreResult => {
  assertValidThresholds(config.thresholds);

  const { actives, disabledCriteria } = collectActiveCriteria(context, config, criteria);

  if (actives.length === 0) {
    return emptyScoreResult(config.thresholds, disabledCriteria);
  }

  const weightSum = actives.reduce((sum, a) => sum + a.configWeight, 0);
  if (weightSum <= 0) {
    throw new Error("Sum of active criterion weights must be positive");
  }

  actives.sort((a, b) => a.id.localeCompare(b.id));

  const { breakdown, baseScore } = computeBreakdown(actives, weightSum);
  const { score: finalScore, mutatorsApplied } = applyMutators(
    context,
    baseScore,
    config.mutators,
    mutators,
  );

  return {
    score: finalScore,
    tier: tierForScore(finalScore, config.thresholds),
    breakdown,
    mutatorsApplied,
    disabledCriteria,
  };
};
