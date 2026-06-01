/**
 * Types used only inside the scoring pipeline. They are not part of the neutral
 * domain model in `types.ts` and are not re-exported from `index.ts`.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 */
import type { Criterion, CriterionResult } from "./types.js";

/** One criterion that survived gating, with its config weight and a cached {@link CriterionResult}. */
export type ActiveCriterion = {
  id: string;
  criterion: Criterion;
  configWeight: number;
  options: unknown;
  evaluated: CriterionResult;
};

/** Outcome of resolving a single configured criterion id. */
export type CriterionResolution =
  | { type: "omit" }
  | { type: "disabled"; id: string }
  | { type: "active"; active: ActiveCriterion };

/** Gating state before running {@link Criterion.evaluate}. */
export type CriterionGate = "omit" | "disabled" | "continue";

/** Intermediate weighted contribution for one active criterion row. */
export type WeightedParts = {
  raw: number;
  normalizedWeight: number;
  weighted: number;
  evaluated: CriterionResult;
};

/** Result of attempting one mutator application. */
export type MutatorApplyResult = { nextScore: number; didApply: boolean };
