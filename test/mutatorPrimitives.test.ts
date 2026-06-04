import { describe, expect, it } from "vitest";

import {
  createConditionalMultiplierMutator,
  readExclusiveMinimumOneMultiplier,
} from "../core/mutators/mutatorPrimitives.js";
import type { PRContext } from "../core/types.js";

const minimalContext = (overrides: Partial<PRContext> = {}): PRContext => ({
  repoSlug: "acme/widget",
  changeNumber: 1,
  headSha: "abc",
  baseRef: "main",
  author: "dev",
  title: "Test",
  body: "",
  labels: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  files: [],
  totalAdditions: 0,
  totalDeletions: 0,
  ...overrides,
});

describe("readExclusiveMinimumOneMultiplier", () => {
  it("returns null for non-object options", () => {
    expect(readExclusiveMinimumOneMultiplier(null)).toBeNull();
    expect(readExclusiveMinimumOneMultiplier(undefined)).toBeNull();
    expect(readExclusiveMinimumOneMultiplier("x")).toBeNull();
    expect(readExclusiveMinimumOneMultiplier([])).toBeNull();
  });

  it("returns null when multiplier is missing, not finite, or at most 1", () => {
    expect(readExclusiveMinimumOneMultiplier({})).toBeNull();
    expect(readExclusiveMinimumOneMultiplier({ multiplier: 1 })).toBeNull();
    expect(readExclusiveMinimumOneMultiplier({ multiplier: 0.5 })).toBeNull();
    expect(readExclusiveMinimumOneMultiplier({ multiplier: NaN })).toBeNull();
  });

  it("returns the multiplier when strictly greater than 1", () => {
    expect(readExclusiveMinimumOneMultiplier({ multiplier: 1.01 })).toBeCloseTo(1.01);
    expect(readExclusiveMinimumOneMultiplier({ multiplier: 2 })).toBe(2);
  });
});

describe("createConditionalMultiplierMutator", () => {
  it("returns null when applies is false without reading multiplier", () => {
    const mutator = createConditionalMultiplierMutator({
      name: "Test gate",
      applies: () => false,
    });
    expect(mutator.apply(minimalContext(), { multiplier: 2 })).toBeNull();
  });

  it("returns multiplier when applies is true and multiplier is valid", () => {
    const mutator = createConditionalMultiplierMutator({
      name: "Test always",
      applies: () => true,
    });
    expect(mutator.apply(minimalContext(), { multiplier: 1.5 })).toBeCloseTo(1.5);
  });

  it("throws when applies is true but multiplier is invalid", () => {
    const mutator = createConditionalMultiplierMutator({
      name: "Test throw",
      applies: () => true,
    });
    expect(() => mutator.apply(minimalContext(), {})).toThrow(/Test throw/);
    expect(() => mutator.apply(minimalContext(), { multiplier: 1 })).toThrow(/Test throw/);
  });
});
