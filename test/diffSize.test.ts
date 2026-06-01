import { describe, expect, it } from "vitest";

import { diffSizeCriterion } from "../core/criteria/diffSize.js";
import { score } from "../core/index.js";
import type { PRContext, ScoringConfig } from "../core/types.js";

const baseContext = (overrides: Partial<PRContext> = {}): PRContext => ({
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

describe("diffSizeCriterion", () => {
  it("scores zero when there is no line churn", () => {
    const criterionResult = diffSizeCriterion.evaluate(baseContext(), {});
    expect(criterionResult.score).toBe(0);
    expect(criterionResult.justification).toContain("0 total");
  });

  it("reaches 100 at the default cap", () => {
    const criterionResult = diffSizeCriterion.evaluate(
      baseContext({ totalAdditions: 400, totalDeletions: 0 }),
      {},
    );
    expect(criterionResult.score).toBe(100);
  });

  it("scales linearly against the cap", () => {
    const criterionResult = diffSizeCriterion.evaluate(
      baseContext({ totalAdditions: 200, totalDeletions: 0 }),
      {},
    );
    expect(criterionResult.score).toBe(50);
  });

  it("respects max_lines_for_cap in options", () => {
    const criterionResult = diffSizeCriterion.evaluate(
      baseContext({ totalAdditions: 100, totalDeletions: 0 }),
      { max_lines_for_cap: 100 },
    );
    expect(criterionResult.score).toBe(100);
  });

  it("ignores invalid max_lines_for_cap and uses default", () => {
    const criterionResult = diffSizeCriterion.evaluate(
      baseContext({ totalAdditions: 200, totalDeletions: 0 }),
      { max_lines_for_cap: -1 },
    );
    expect(criterionResult.score).toBe(50);
  });

  it("treats non-object options as default cap", () => {
    const criterionResult = diffSizeCriterion.evaluate(
      baseContext({ totalAdditions: 400, totalDeletions: 0 }),
      "bad",
    );
    expect(criterionResult.score).toBe(100);
  });

  it("treats null and undefined options like the default cap", () => {
    const heavyChurn = baseContext({ totalAdditions: 400, totalDeletions: 0 });
    expect(diffSizeCriterion.evaluate(heavyChurn, null).score).toBe(100);
    expect(diffSizeCriterion.evaluate(heavyChurn, undefined).score).toBe(100);
  });
});

describe("score with built-in diff_size", () => {
  const thresholds = { low: 30, medium: 60 } as const;

  it("includes diff_size in breakdown when configured", () => {
    const config: ScoringConfig = {
      thresholds,
      criteria: {
        diff_size: { weight: 100, options: { max_lines_for_cap: 100 } },
      },
    };
    const scoreResult = score(baseContext({ totalAdditions: 50, totalDeletions: 0 }), config);
    expect(scoreResult.breakdown).toHaveLength(1);
    expect(scoreResult.breakdown[0]!.name).toBe("Diff size");
    expect(scoreResult.score).toBe(50);
    expect(scoreResult.tier).toBe("MEDIUM");
  });
});
