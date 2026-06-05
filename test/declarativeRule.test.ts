import { describe, expect, it } from "vitest";

import {
  buildDeclarativeRuleCriteriaMap,
  declarativeCriterionId,
} from "../core/rules/declarativeRule.js";
import { scoreWithRegistries } from "../core/scorer.js";
import type { Criterion, PRContext, ScoringConfig } from "../core/types.js";

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

const thresholds = { low: 30, medium: 60 } as const;

describe("buildDeclarativeRuleCriteriaMap", () => {
  it("returns empty map when declarative_rules is absent", () => {
    const config: ScoringConfig = {
      thresholds,
      criteria: { a: { weight: 100, options: {} } },
    };
    expect(buildDeclarativeRuleCriteriaMap(config)).toEqual({});
  });

  it("returns one criterion per rule id with declarative: prefix keys", () => {
    const config: ScoringConfig = {
      thresholds,
      criteria: {},
      declarative_rules: {
        z_rule: { weight: 10, options: { labels_any: ["z"], score: 50 } },
        a_rule: { weight: 10, options: { labels_any: ["a"], score: 40 } },
      },
    };
    const map = buildDeclarativeRuleCriteriaMap(config);
    expect(Object.keys(map).sort()).toEqual(["declarative:a_rule", "declarative:z_rule"]);
    expect(map[declarativeCriterionId("a_rule")]?.name).toBe("Declarative rule: a_rule");
  });
});

describe("declarative labels_any interpreter", () => {
  const criterionUnderTest = buildDeclarativeRuleCriteriaMap({
    thresholds,
    criteria: {},
    declarative_rules: {
      risk_labels: {
        weight: 100,
        options: { labels_any: ["database", "security"], score: 75 },
      },
    },
  })[declarativeCriterionId("risk_labels")]!;

  it("scores zero when labels_any is missing or empty after sanitization", () => {
    const emptyOptions = criterionUnderTest.evaluate(minimalContext(), {});
    expect(emptyOptions.score).toBe(0);
    expect(emptyOptions.justification).toContain("No labels_any");

    const noLabels = criterionUnderTest.evaluate(minimalContext(), { labels_any: [], score: 99 });
    expect(noLabels.score).toBe(0);
  });

  it("scores zero when no label matches (case-insensitive)", () => {
    const result = criterionUnderTest.evaluate(
      minimalContext({ labels: ["Database", "docs"] }),
      { labels_any: ["production"], score: 80 },
    );
    expect(result.score).toBe(0);
    expect(result.justification).toContain("None of the configured");
  });

  it("scores configured value when any label matches", () => {
    const result = criterionUnderTest.evaluate(
      minimalContext({ labels: ["trivial", "DATABASE"] }),
      { labels_any: ["database"], score: 82 },
    );
    expect(result.score).toBe(82);
    expect(result.justification).toContain("Matched");
  });

  it("clamps score from options", () => {
    const result = criterionUnderTest.evaluate(
      minimalContext({ labels: ["database"] }),
      { labels_any: ["database"], score: 999 },
    );
    expect(result.score).toBe(100);
  });
});

describe("scoreWithRegistries with declarative_rules", () => {
  it("combines built-in criterion keys and declarative rules in one weight pool", () => {
    const criterionA: Criterion = {
      name: "Built-in A",
      evaluate: () => ({ score: 40, justification: "a" }),
    };
    const config: ScoringConfig = {
      thresholds,
      criteria: {
        builtin_a: { weight: 50, options: {} },
      },
      declarative_rules: {
        label_risk: {
          weight: 50,
          options: { labels_any: ["hotfix"], score: 60 },
        },
      },
    };
    const scoreResult = scoreWithRegistries(
      minimalContext({ labels: ["hotfix"] }),
      config,
      { builtin_a: criterionA },
      {},
    );
    expect(scoreResult.breakdown).toHaveLength(2);
    const names = scoreResult.breakdown.map((row) => row.name).sort();
    expect(names).toEqual(["Built-in A", "Declarative rule: label_risk"]);
    expect(scoreResult.score).toBeCloseTo(50, 5);
  });
});
