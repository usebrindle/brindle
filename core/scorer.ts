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

function clampScore(n: number): number {
  return Math.min(100, Math.max(0, n));
}

function assertValidThresholds(t: ScoringConfig["thresholds"]): void {
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
}

function tierForScore(
  score: number,
  thresholds: ScoringConfig["thresholds"],
): "LOW" | "MEDIUM" | "HIGH" {
  if (score <= thresholds.low) return "LOW";
  if (score <= thresholds.medium) return "MEDIUM";
  return "HIGH";
}

type ActiveCriterion = {
  id: string;
  criterion: Criterion;
  configWeight: number;
  options: unknown;
  evaluated: CriterionResult;
};

/**
 * Pure scoring engine. Same inputs always yield the same result shape.
 * @see docs/designs/lld-merge-risk-classifier.md
 */
export function score(context: PRContext, config: ScoringConfig): ScoreResult {
  return scoreWithRegistries(context, config, builtInCriteria, builtInMutators);
}

/**
 * Like {@link score} but with explicit registries (tests and future plugin wiring).
 */
export function scoreWithRegistries(
  context: PRContext,
  config: ScoringConfig,
  criteria: Record<string, Criterion>,
  mutators: Record<string, Mutator>,
): ScoreResult {
  assertValidThresholds(config.thresholds);

  const disabledCriteria: string[] = [];
  const actives: ActiveCriterion[] = [];

  const criterionIds = Object.keys(config.criteria).sort((a, b) => a.localeCompare(b));

  for (const id of criterionIds) {
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

  if (actives.length === 0) {
    return {
      score: 0,
      tier: tierForScore(0, config.thresholds),
      breakdown: [],
      mutatorsApplied: [],
      disabledCriteria,
    };
  }

  const weightSum = actives.reduce((s, a) => s + a.configWeight, 0);
  if (weightSum <= 0) {
    throw new Error("Sum of active criterion weights must be positive");
  }

  actives.sort((a, b) => a.id.localeCompare(b.id));

  const breakdown: CriterionBreakdown[] = [];
  let baseScore = 0;

  for (const a of actives) {
    const evaluated = a.evaluated;
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

  let running = clampScore(baseScore);
  const mutatorsApplied: string[] = [];

  const mutatorEntries = Object.entries(config.mutators ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  ) as [string, MutatorConfiguration][];

  for (const [id, mcfg] of mutatorEntries) {
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

  return {
    score: running,
    tier: tierForScore(running, config.thresholds),
    breakdown,
    mutatorsApplied,
    disabledCriteria,
  };
}
