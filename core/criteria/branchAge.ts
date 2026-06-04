/**
 * Built-in `branch_age` criterion (runtime only). Options types live in {@link ./branchAge.types.js}.
 *
 * Scores risk from **head commit age**: elapsed time from {@link PRContext.headCommitCommittedAtIso}
 * to {@link PRContext.classifiedAtIso}. Higher raw scores mean an older tip commit relative to the
 * classification instant. Criteria do not read the system clock; both instants must come from the adapter.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 * @see docs/adrs/0004-pure-criteria-over-hydrated-context.md
 */
import type { Criterion, CriterionResult, PRContext } from "../types.js";

import type { BranchAgeCriterionOptions } from "./branchAge.types.js";

const DEFAULT_MAX_AGE_HOURS_FOR_CAP = 168;

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

/**
 * @param options - `criteria.branch_age.options` from config, or `unknown` until schema validation lands.
 * @returns Positive hour count at which raw score reaches 100; falls back when options are missing or invalid.
 */
const maxAgeHoursForCapFromOptions = (options: unknown): number => {
  if (options === null || options === undefined) return DEFAULT_MAX_AGE_HOURS_FOR_CAP;
  if (typeof options !== "object" || Array.isArray(options)) return DEFAULT_MAX_AGE_HOURS_FOR_CAP;
  const record = options as BranchAgeCriterionOptions;
  const configured = record.max_age_hours_for_cap;
  if (typeof configured !== "number" || !Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_MAX_AGE_HOURS_FOR_CAP;
  }
  return configured;
};

const temporalInputsPresent = (context: PRContext): boolean => {
  const classifiedAtIso = context.classifiedAtIso;
  const headCommitCommittedAtIso = context.headCommitCommittedAtIso;
  return (
    typeof classifiedAtIso === "string" &&
    classifiedAtIso.trim() !== "" &&
    typeof headCommitCommittedAtIso === "string" &&
    headCommitCommittedAtIso.trim() !== ""
  );
};

/**
 * @param context - Hydrated change; requires parseable {@link PRContext.classifiedAtIso} and {@link PRContext.headCommitCommittedAtIso}.
 * @returns Non-negative age in hours, or `null` when timestamps do not parse to finite instants.
 */
const headCommitAgeHoursFromContext = (context: PRContext): number | null => {
  const classifiedAtMs = Date.parse(context.classifiedAtIso!);
  const headCommittedAtMs = Date.parse(context.headCommitCommittedAtIso!);
  if (!Number.isFinite(classifiedAtMs) || !Number.isFinite(headCommittedAtMs)) {
    return null;
  }
  const deltaMs = classifiedAtMs - headCommittedAtMs;
  if (!Number.isFinite(deltaMs)) {
    return null;
  }
  return Math.max(0, deltaMs / MILLISECONDS_PER_HOUR);
};

/**
 * Criterion registered under YAML key `branch_age`. Requires adapter-hydrated head commit and classification instants.
 */
export const branchAgeCriterion: Criterion = {
  name: "Head commit age",
  isEnabled: (context: PRContext): boolean => temporalInputsPresent(context),
  /**
   * @param context - Hydrated {@link PRContext}; must not be mutated.
   * @param options - Parsed `criteria.branch_age.options` (see {@link ./branchAge.types.js}); unknown until a later config slice validates YAML.
   * @returns Raw score 0–100 vs cap, justification, and optional `detail` for audit.
   */
  evaluate: (context: PRContext, options: unknown): CriterionResult => {
    const ageHours = headCommitAgeHoursFromContext(context);
    if (ageHours === null) {
      return {
        score: 0,
        justification: "Head commit age could not be computed from the hydrated timestamps.",
        selfDisable: true,
      };
    }
    const maxAgeHoursForCap = maxAgeHoursForCapFromOptions(options);
    const rawCriterionScore = Math.min(100, (ageHours / maxAgeHoursForCap) * 100);
    const ageHoursRounded = Math.round(ageHours * 100) / 100;
    return {
      score: rawCriterionScore,
      justification: `Head commit is about ${ageHoursRounded}h old (cap ${maxAgeHoursForCap}h for raw score 100).`,
      detail: {
        ageHours: ageHoursRounded,
        maxAgeHoursForCap,
        classifiedAtIso: context.classifiedAtIso,
        headCommitCommittedAtIso: context.headCommitCommittedAtIso,
      },
    };
  },
};
