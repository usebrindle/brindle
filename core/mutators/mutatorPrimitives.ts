/**
 * Shared helpers for built-in mutators that multiply the running score when a pure predicate holds.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 */
import type { Mutator, PRContext } from "../types.js";

/**
 * Builds a {@link Mutator} whose `apply` returns `null` when `applies` is false, otherwise returns
 * `options.multiplier` (must be finite and strictly greater than 1). Throws when `applies` is true
 * but `multiplier` is missing or invalid so misconfiguration is not silently ignored.
 */
export type ConditionalMultiplierMutatorSpec = {
  name: string;
  applies: (context: PRContext, options: unknown) => boolean;
};

/**
 * Reads `multiplier` from mutator options when present and valid for a strict multiplicative bump.
 *
 * @param options - Typically `mutators.<id>.options` from config (validated by JSON Schema in a later slice).
 * @returns A finite number strictly greater than 1, or `null` when absent or invalid.
 */
export const readExclusiveMinimumOneMultiplier = (options: unknown): number | null => {
  if (options === null || options === undefined || typeof options !== "object" || Array.isArray(options)) {
    return null;
  }
  const raw = (options as Record<string, unknown>).multiplier;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 1) {
    return null;
  }
  return raw;
};

/**
 * @param spec - Display name and pure predicate; multiplier is read from options via {@link readExclusiveMinimumOneMultiplier}.
 * @returns A {@link Mutator} suitable for {@link import("./builtins.js").builtInMutators}.
 */
export const createConditionalMultiplierMutator = (spec: ConditionalMultiplierMutatorSpec): Mutator => ({
  name: spec.name,
  apply: (context: PRContext, options: unknown): number | null => {
    if (!spec.applies(context, options)) {
      return null;
    }
    const multiplier = readExclusiveMinimumOneMultiplier(options);
    if (multiplier === null) {
      throw new Error(
        `Mutator "${spec.name}" matched but options.multiplier is missing or invalid (expected a finite number > 1).`,
      );
    }
    return multiplier;
  },
});
