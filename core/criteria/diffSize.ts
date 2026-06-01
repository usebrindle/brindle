/**
 * Built-in `diff_size` criterion (runtime only). Options types live in {@link ./diffSize.types.js}.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 * @see docs/adrs/0004-pure-criteria-over-hydrated-context.md
 */
import type { Criterion, CriterionResult, PRContext } from "../types.js";

const DEFAULT_CAP_LINES = 400;

/**
 * Resolves the line cap used to map total changed lines to a 0–100 raw score.
 *
 * @param options - `criteria.diff_size.options` from config, or `unknown` until schema validation lands.
 * @returns Positive line count at which raw score reaches 100; falls back when options are missing or invalid.
 */
const capLinesFromOptions = (options: unknown): number => {
  if (options === null || options === undefined) return DEFAULT_CAP_LINES;
  if (typeof options !== "object") return DEFAULT_CAP_LINES;
  const optionsRecord = options as Record<string, unknown>;
  const configuredMaxLinesForCap = optionsRecord.max_lines_for_cap;
  if (
    typeof configuredMaxLinesForCap !== "number" ||
    !Number.isFinite(configuredMaxLinesForCap) ||
    configuredMaxLinesForCap <= 0
  ) {
    return DEFAULT_CAP_LINES;
  }
  return configuredMaxLinesForCap;
};

/**
 * @param context - Hydrated change; uses `totalAdditions` and `totalDeletions` only for this criterion.
 * @returns Non-negative sum of additions and deletions.
 */
const totalChangedLinesFromContext = (context: PRContext): number =>
  Math.max(0, context.totalAdditions + context.totalDeletions);

/**
 * Criterion registered under YAML key `diff_size`. Scores change size from total line churn vs a cap.
 */
export const diffSizeCriterion: Criterion = {
  name: "Diff size",
  /**
   * @param context - Hydrated {@link PRContext}; must not be mutated.
   * @param options - Parsed `criteria.diff_size.options` (see {@link ./diffSize.types.js}); unknown until a later config slice validates YAML.
   * @returns Raw score 0–100 (higher when more lines changed vs cap), justification, and `detail.lines` / `detail.cap`.
   */
  evaluate: (context: PRContext, options: unknown): CriterionResult => {
    const maxLinesForCap = capLinesFromOptions(options);
    const totalChangedLines = totalChangedLinesFromContext(context);
    const rawCriterionScore = Math.min(100, (totalChangedLines / maxLinesForCap) * 100);
    return {
      score: rawCriterionScore,
      justification: `${totalChangedLines} total lines changed (additions + deletions)`,
      detail: { lines: totalChangedLines, cap: maxLinesForCap },
    };
  },
};
