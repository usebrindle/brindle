import type { Criterion } from "../types.js";

import { diffSizeCriterion } from "./diffSize.js";

/**
 * Built-in criteria registered by id (matches keys under `criteria` in `.merge-risk.yml`).
 */
export const builtInCriteria: Record<string, Criterion> = {
  diff_size: diffSizeCriterion,
};
