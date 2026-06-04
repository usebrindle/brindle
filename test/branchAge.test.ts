import { describe, expect, it } from "vitest";

import { branchAgeCriterion } from "../core/criteria/branchAge.js";
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

const contextWithHeadAge = (ageHours: number): PRContext => {
  const headCommittedAt = new Date("2026-01-01T00:00:00.000Z").getTime();
  const classifiedAt = headCommittedAt + ageHours * 60 * 60 * 1000;
  return baseContext({
    headCommitCommittedAtIso: new Date(headCommittedAt).toISOString(),
    classifiedAtIso: new Date(classifiedAt).toISOString(),
  });
};

describe("branchAgeCriterion", () => {
  it("is disabled when classifiedAtIso is missing", () => {
    expect(
      branchAgeCriterion.isEnabled?.(
        baseContext({ headCommitCommittedAtIso: "2026-01-01T00:00:00.000Z" }),
        {},
      ),
    ).toBe(false);
  });

  it("is disabled when headCommitCommittedAtIso is missing", () => {
    expect(branchAgeCriterion.isEnabled?.(baseContext({ classifiedAtIso: "2026-01-02T00:00:00.000Z" }), {})).toBe(
      false,
    );
  });

  it("is enabled when both temporal fields are present", () => {
    expect(
      branchAgeCriterion.isEnabled?.(
        baseContext({
          classifiedAtIso: "2026-01-02T00:00:00.000Z",
          headCommitCommittedAtIso: "2026-01-01T00:00:00.000Z",
        }),
        {},
      ),
    ).toBe(true);
  });

  it("scores zero when head commit timestamp equals classified instant", () => {
    const sameInstant = "2026-06-01T12:00:00.000Z";
    const criterionResult = branchAgeCriterion.evaluate(
      baseContext({
        classifiedAtIso: sameInstant,
        headCommitCommittedAtIso: sameInstant,
      }),
      {},
    );
    expect(criterionResult.score).toBe(0);
    expect(criterionResult.selfDisable).toBeUndefined();
  });

  it("scores 100 at the default cap (168h)", () => {
    const criterionResult = branchAgeCriterion.evaluate(contextWithHeadAge(168), {});
    expect(criterionResult.score).toBe(100);
  });

  it("scales linearly against the cap", () => {
    const criterionResult = branchAgeCriterion.evaluate(contextWithHeadAge(84), {});
    expect(criterionResult.score).toBe(50);
  });

  it("respects max_age_hours_for_cap in options", () => {
    const criterionResult = branchAgeCriterion.evaluate(contextWithHeadAge(50), {
      max_age_hours_for_cap: 100,
    });
    expect(criterionResult.score).toBe(50);
  });

  it("self-disables when timestamps are present but not parseable", () => {
    const criterionResult = branchAgeCriterion.evaluate(
      baseContext({
        classifiedAtIso: "not-a-date",
        headCommitCommittedAtIso: "2026-01-01T00:00:00.000Z",
      }),
      {},
    );
    expect(criterionResult.selfDisable).toBe(true);
    expect(criterionResult.score).toBe(0);
  });

  it("treats head commit after classified instant as zero age", () => {
    const criterionResult = branchAgeCriterion.evaluate(
      baseContext({
        headCommitCommittedAtIso: "2026-01-02T00:00:00.000Z",
        classifiedAtIso: "2026-01-01T00:00:00.000Z",
      }),
      {},
    );
    expect(criterionResult.score).toBe(0);
  });

  it("ignores invalid max_age_hours_for_cap and uses default", () => {
    const criterionResult = branchAgeCriterion.evaluate(contextWithHeadAge(84), {
      max_age_hours_for_cap: -1,
    });
    expect(criterionResult.score).toBe(50);
  });

  it("treats non-object options as default cap", () => {
    const criterionResult = branchAgeCriterion.evaluate(contextWithHeadAge(168), "bad");
    expect(criterionResult.score).toBe(100);
  });
});

describe("score with built-in branch_age", () => {
  const thresholds = { low: 30, medium: 60 } as const;

  it("includes branch_age in breakdown when configured", () => {
    const config: ScoringConfig = {
      thresholds,
      criteria: {
        branch_age: { weight: 100, options: { max_age_hours_for_cap: 100 } },
      },
    };
    const scoreResult = score(contextWithHeadAge(50), config);
    expect(scoreResult.breakdown).toHaveLength(1);
    expect(scoreResult.breakdown[0]!.name).toBe("Head commit age");
    expect(scoreResult.score).toBe(50);
    expect(scoreResult.tier).toBe("MEDIUM");
  });
});
