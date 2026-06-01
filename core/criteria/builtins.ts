/**
 * Registry of built-in {@link Criterion} implementations keyed by merge-risk `criteria` ids.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 */
import type { Criterion } from "../types.js";

import { diffSizeCriterion } from "./diffSize.js";
import { testCoverageCriterion } from "./testCoverage.js";

/**
 * Map from YAML criterion id (e.g. `diff_size`) to implementation. Consumers rely on stable ids across releases.
 */
export const builtInCriteria: Record<string, Criterion> = {
  diff_size: diffSizeCriterion,
  test_coverage: testCoverageCriterion,
};
