/**
 * Registry of built-in {@link Mutator} implementations keyed by merge-risk `mutators` ids.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 */
import type { Mutator } from "../types.js";

/**
 * Map from YAML mutator id to implementation. Empty until mutator slices land.
 */
export const builtInMutators: Record<string, Mutator> = {};
