/**
 * Registry of built-in {@link Criterion} implementations keyed by merge-risk `criteria` ids.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 */
import type { Criterion } from "../types.js";

import { authorFamiliarityCriterion } from "./authorFamiliarity.js";
import { authorSeniorityCriterion } from "./authorSeniority.js";
import { blastRadiusCriterion } from "./blastRadius.js";
import { branchAgeCriterion } from "./branchAge.js";
import { diffSizeCriterion } from "./diffSize.js";
import { filePatternsCriterion } from "./filePatterns.js";
import { serviceCriticalityCriterion } from "./serviceCriticality.js";
import { testCoverageCriterion } from "./testCoverage.js";

/**
 * Map from YAML criterion id (e.g. `diff_size`) to implementation. Consumers rely on stable ids across releases.
 */
export const builtInCriteria: Record<string, Criterion> = {
  author_familiarity: authorFamiliarityCriterion,
  blast_radius: blastRadiusCriterion,
  author_seniority: authorSeniorityCriterion,
  branch_age: branchAgeCriterion,
  diff_size: diffSizeCriterion,
  file_patterns: filePatternsCriterion,
  service_criticality: serviceCriticalityCriterion,
  test_coverage: testCoverageCriterion,
};
