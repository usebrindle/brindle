/**
 * Built-in `diff_size` criterion (runtime only). Options types: {@link ./diffSize.types.js}.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 * @see docs/adrs/0004-pure-criteria-over-hydrated-context.md
 */
import type { Criterion, CriterionResult, PRContext } from "../types.js";

const DEFAULT_CAP_LINES = 400;

const capLinesFromOptions = (options: unknown): number => {
  if (options === null || options === undefined) return DEFAULT_CAP_LINES;
  if (typeof options !== "object") return DEFAULT_CAP_LINES;
  const o = options as Record<string, unknown>;
  const raw = o.max_lines_for_cap;
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
