/**
 * Built-in `test_coverage` criterion: scores risk from Istanbul-derived coverage on {@link PRContext.coverage}.
 *
 * @see docs/adrs/0004-pure-criteria-over-hydrated-context.md
 * @see docs/adrs/0005-read-findings-not-run-tools.md
 */
import type { Criterion, CriterionResult, PRContext } from "../types.js";

import type { TestCoverageCriterionOptions } from "./testCoverage.types.js";

const DEFAULT_MINIMUM_PERCENT = 80;

const minimumPercentFromOptions = (options: unknown): number => {
  if (options === null || options === undefined) return DEFAULT_MINIMUM_PERCENT;
  if (typeof options !== "object" || Array.isArray(options)) return DEFAULT_MINIMUM_PERCENT;
  const record = options as TestCoverageCriterionOptions;
  const raw = record.minimum_percent;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0 || raw > 100) {
    return DEFAULT_MINIMUM_PERCENT;
  }
  return raw;
};

const coveragePercent = (context: PRContext): number | undefined => {
  const coverage = context.coverage;
  if (
    coverage === undefined ||
    typeof coverage.linesTotal !== "number" ||
    typeof coverage.linesCovered !== "number" ||
    coverage.linesTotal <= 0
  ) {
    return undefined;
  }
  return (coverage.linesCovered / coverage.linesTotal) * 100;
};

/**
 * Criterion registered under YAML key `test_coverage`. Requires {@link PRContext.coverage} from an Istanbul report.
 */
export const testCoverageCriterion: Criterion = {
  name: "Test coverage (Istanbul)",
  isEnabled: (context: PRContext): boolean => coveragePercent(context) !== undefined,
  evaluate: (context: PRContext, options: unknown): CriterionResult => {
    const actualPercent = coveragePercent(context);
    if (actualPercent === undefined) {
      return {
        score: 0,
        justification: "No Istanbul coverage data on the change context.",
        selfDisable: true,
      };
    }
    const minimumPercent = minimumPercentFromOptions(options);
    if (actualPercent >= minimumPercent) {
      return {
        score: 0,
        justification: `Statement coverage ${actualPercent.toFixed(1)}% meets minimum ${minimumPercent}%.`,
        detail: { actualPercent, minimumPercent },
      };
    }
    const rawScore = Math.min(
      100,
      Math.max(0, ((minimumPercent - actualPercent) / minimumPercent) * 100),
    );
    return {
      score: rawScore,
      justification: `Statement coverage ${actualPercent.toFixed(1)}% is below minimum ${minimumPercent}%.`,
      detail: { actualPercent, minimumPercent },
    };
  },
};
