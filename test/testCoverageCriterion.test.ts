import { describe, expect, it } from "vitest";

import { testCoverageCriterion } from "../core/criteria/testCoverage.js";
import type { PRContext } from "../core/types.js";

const baseContext = (): PRContext => ({
  repoSlug: "acme/demo",
  changeNumber: 1,
  headSha: "abc",
  baseRef: "main",
  author: "dev",
  title: "t",
  body: "",
  labels: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  files: [],
  totalAdditions: 0,
  totalDeletions: 0,
});

describe("testCoverageCriterion", () => {
  it("is not enabled when coverage is missing", () => {
    const context = baseContext();
    expect(testCoverageCriterion.isEnabled?.(context, {})).toBe(false);
  });

  it("is enabled when coverage has statement totals", () => {
    const context = { ...baseContext(), coverage: { linesCovered: 9, linesTotal: 10 } };
    expect(testCoverageCriterion.isEnabled?.(context, {})).toBe(true);
  });

  it("scores 0 when coverage meets minimum_percent", () => {
    const context = { ...baseContext(), coverage: { linesCovered: 90, linesTotal: 100 } };
    const result = testCoverageCriterion.evaluate(context, { minimum_percent: 80 });
    expect(result.score).toBe(0);
    expect(result.selfDisable).toBeUndefined();
  });

  it("scores above 0 when coverage is below minimum_percent", () => {
    const context = { ...baseContext(), coverage: { linesCovered: 40, linesTotal: 100 } };
    const result = testCoverageCriterion.evaluate(context, { minimum_percent: 80 });
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("defaults minimum_percent to 80 when options are missing", () => {
    const context = { ...baseContext(), coverage: { linesCovered: 70, linesTotal: 100 } };
    const result = testCoverageCriterion.evaluate(context, undefined);
    expect(result.score).toBeGreaterThan(0);
  });

  it("self-disables when evaluate runs without coverage data", () => {
    const result = testCoverageCriterion.evaluate(baseContext(), {});
    expect(result.selfDisable).toBe(true);
  });
});
