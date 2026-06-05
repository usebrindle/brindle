/**
 * Registry of built-in {@link Mutator} implementations keyed by merge-risk `mutators` ids.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 */
import type { Mutator } from "../types.js";

import { criticalServiceMutator } from "./criticalService.js";
import { juniorAuthorMutator } from "./juniorAuthor.js";

/**
 * Map from YAML mutator id to implementation.
 */
export const builtInMutators: Record<string, Mutator> = {
  critical_service: criticalServiceMutator,
  junior_author: juniorAuthorMutator,
};
