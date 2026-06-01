import type { Criterion, CriterionResult, PRContext } from "../types.js";

const DEFAULT_CAP_LINES = 400;

/**
 * Optional YAML `options` for `diff_size` (all keys optional).
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 */
export type DiffSizeOptions = {
  /**
   * Total added+deleted lines at which this criterion reaches raw score 100.
   * Must be a positive finite number when set.
   */
  max_lines_for_cap?: number;
};

const capLinesFromOptions = (options: unknown): number => {
  if (options === null || options === undefined) return DEFAULT_CAP_LINES;
  if (typeof options !== "object") return DEFAULT_CAP_LINES;
  const raw = (options as DiffSizeOptions).max_lines_for_cap;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return DEFAULT_CAP_LINES;
  return raw;
};

const totalChangedLines = (context: PRContext): number =>
  Math.max(0, context.totalAdditions + context.totalDeletions);

/**
 * Scores by total changed lines (additions + deletions). Higher change volume → higher raw score (0–100).
 */
export const diffSizeCriterion: Criterion = {
  name: "Diff size",
  evaluate: (context: PRContext, options: unknown): CriterionResult => {
    const cap = capLinesFromOptions(options);
    const lines = totalChangedLines(context);
    const score = Math.min(100, (lines / cap) * 100);
    return {
      score,
      justification: `${lines} total lines changed (additions + deletions)`,
      detail: { lines, cap },
    };
  },
};
