/**
 * Declarative merge-risk rules: fixed interpreter over {@link PRContext}, same {@link Criterion} contract as built-ins.
 *
 * @see docs/adrs/0001-no-pr-head-execution.md
 * @see docs/designs/lld-merge-risk-classifier.md
 */
import type { Criterion, CriterionResult, PRContext, ScoringConfig } from "../types.js";

/** Prefix for internal criterion ids so `declarative_rules` keys never collide with `criteria` keys. */
export const DECLARATIVE_CRITERION_ID_PREFIX = "declarative:" as const;

/**
 * @param declarativeRuleId - Key under `declarative_rules` in config (not including prefix).
 * @returns Internal criterion id passed to the scorer pipeline.
 */
export const declarativeCriterionId = (declarativeRuleId: string): string =>
  `${DECLARATIVE_CRITERION_ID_PREFIX}${declarativeRuleId}`;

const clampScore = (value: number): number => Math.min(100, Math.max(0, value));

const normalizedLabelSet = (labels: string[]): Set<string> =>
  new Set(labels.map((label) => label.trim().toLowerCase()).filter((label) => label.length > 0));

const labelsAnyFromOptions = (options: unknown): string[] => {
  if (options === null || options === undefined || typeof options !== "object" || Array.isArray(options)) {
    return [];
  }
  const record = options as Record<string, unknown>;
  const raw = record.labels_any;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed.length > 0) out.push(trimmed.toLowerCase());
  }
  return out;
};

const scoreFromOptions = (options: unknown): number => {
  if (options === null || options === undefined || typeof options !== "object" || Array.isArray(options)) {
    return 0;
  }
  const record = options as Record<string, unknown>;
  const rawScore = record.score;
  if (typeof rawScore !== "number" || !Number.isFinite(rawScore)) return 0;
  return clampScore(rawScore);
};

const evaluateLabelsAny = (context: PRContext, options: unknown): CriterionResult => {
  const needles = labelsAnyFromOptions(options);
  const configuredScore = scoreFromOptions(options);
  if (needles.length === 0) {
    return {
      score: 0,
      justification: "No labels_any entries configured for this declarative rule.",
    };
  }
  const prLabels = normalizedLabelSet(context.labels);
  const matched = needles.filter((needle) => prLabels.has(needle));
  if (matched.length === 0) {
    return {
      score: 0,
      justification: "None of the configured labels_any values are present on this change.",
      detail: { labels_any: needles },
    };
  }
  return {
    score: configuredScore,
    justification: `Matched declarative label(s): ${matched.join(", ")}.`,
    detail: { matched_labels: matched, labels_any: needles },
  };
};

const createLabelsAnyDeclarativeCriterion = (declarativeRuleId: string): Criterion => ({
  name: `Declarative rule: ${declarativeRuleId}`,
  evaluate: (context: PRContext, options: unknown): CriterionResult =>
    evaluateLabelsAny(context, options),
});

/**
 * Builds criterion implementations for every key in `config.declarative_rules`, keyed by {@link declarativeCriterionId}.
 *
 * @param config - Parsed scoring config (declarative section optional).
 * @returns Map entries to merge with built-in criteria before scoring.
 */
export const buildDeclarativeRuleCriteriaMap = (config: ScoringConfig): Record<string, Criterion> => {
  const declarativeRules = config.declarative_rules;
  if (declarativeRules === undefined) return {};
  const sortedRuleIds = Object.keys(declarativeRules).sort((leftRuleId, rightRuleId) =>
    leftRuleId.localeCompare(rightRuleId),
  );
  const result: Record<string, Criterion> = {};
  for (const declarativeRuleId of sortedRuleIds) {
    result[declarativeCriterionId(declarativeRuleId)] = createLabelsAnyDeclarativeCriterion(declarativeRuleId);
  }
  return result;
};
