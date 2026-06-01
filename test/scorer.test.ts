import { describe, expect, it } from "vitest";

import { score } from "../core/index.js";
import { scoreWithRegistries } from "../core/scorer.js";
import type {
  Criterion,
  Mutator,
  PRContext,
  ScoringConfig,
} from "../core/types.js";

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

describe("scoreWithRegistries", () => {
  it("score() delegates to built-in registries (empty)", () => {
    const config: ScoringConfig = { thresholds, criteria: {} };
    expect(score(minimalContext(), config)).toEqual(
      scoreWithRegistries(minimalContext(), config, {}, {}),
    );
  });

  it("returns zero LOW when no criteria remain active", () => {
    const config: ScoringConfig = { thresholds, criteria: {} };
    const scoreResult = scoreWithRegistries(minimalContext(), config, {}, {});
    expect(scoreResult.score).toBe(0);
    expect(scoreResult.tier).toBe("LOW");
    expect(scoreResult.breakdown).toEqual([]);
    expect(scoreResult.mutatorsApplied).toEqual([]);
  });

  it("throws when thresholds are invalid", () => {
    const config: ScoringConfig = {
      thresholds: { low: 60, medium: 30 },
      criteria: {},
    };
    expect(() => scoreWithRegistries(minimalContext(), config, {}, {})).toThrow(
      /Invalid thresholds/,
    );
  });

  it("renormalizes weights and sums weighted scores", () => {
    const criterionA: Criterion = {
      name: "A",
      evaluate: () => ({ score: 40, justification: "a" }),
    };
    const criterionB: Criterion = {
      name: "B",
      evaluate: () => ({ score: 60, justification: "b" }),
    };
    const config: ScoringConfig = {
      thresholds,
      criteria: {
        a: { weight: 50, options: {} },
        b: { weight: 50, options: {} },
      },
    };
    const scoreResult = scoreWithRegistries(
      minimalContext(),
      config,
      { a: criterionA, b: criterionB },
      {},
    );
    expect(scoreResult.score).toBeCloseTo(50, 10);
    expect(scoreResult.tier).toBe("MEDIUM");
    expect(scoreResult.breakdown).toHaveLength(2);
    expect(scoreResult.breakdown[0]!.name).toBe("A");
    expect(scoreResult.breakdown[0]!.weight).toBeCloseTo(50, 10);
  });

  it("drops self-disabled criteria and redistributes weight", () => {
    const selfDisablingCriterion: Criterion = {
      name: "A",
      evaluate: () => ({ score: 99, justification: "skip", selfDisable: true }),
    };
    const remainingCriterion: Criterion = {
      name: "B",
      evaluate: () => ({ score: 80, justification: "b" }),
    };
    const config: ScoringConfig = {
      thresholds,
      criteria: {
        a: { weight: 50 },
        b: { weight: 50 },
      },
    };
    const scoreResult = scoreWithRegistries(
      minimalContext(),
      config,
      { a: selfDisablingCriterion, b: remainingCriterion },
      {},
    );
    expect(scoreResult.disabledCriteria).toContain("a");
    expect(scoreResult.score).toBe(80);
    expect(scoreResult.breakdown).toHaveLength(1);
    expect(scoreResult.breakdown[0]!.weight).toBeCloseTo(100, 10);
  });

  it("respects isEnabled and lists disabled config entries", () => {
    const disabledByGateCriterion: Criterion = {
      name: "A",
      isEnabled: () => false,
      evaluate: () => ({ score: 0, justification: "never" }),
    };
    const activeCriterion: Criterion = {
      name: "B",
      evaluate: () => ({ score: 40, justification: "b" }),
    };
    const config: ScoringConfig = {
      thresholds,
      criteria: {
        a: { weight: 50 },
        b: { weight: 50 },
      },
    };
    const scoreResult = scoreWithRegistries(
      minimalContext(),
      config,
      { a: disabledByGateCriterion, b: activeCriterion },
      {},
    );
    expect(scoreResult.disabledCriteria).toContain("a");
    expect(scoreResult.score).toBe(40);
  });

  it("applies mutators with deterministic ordering in mutatorsApplied", () => {
    const singleCriterion: Criterion = {
      name: "C",
      evaluate: () => ({ score: 10, justification: "c" }),
    };
    const mutatorRegisteredAsZ: Mutator = {
      name: "late",
      apply: () => 3,
    };
    const mutatorRegisteredAsA: Mutator = {
      name: "early",
      apply: () => 2,
    };
    const config: ScoringConfig = {
      thresholds,
      criteria: { c: { weight: 100 } },
      mutators: {
        z: { options: {} },
        a: { options: {} },
      },
    };
    const scoreResult = scoreWithRegistries(
      minimalContext(),
      config,
      { c: singleCriterion },
      { z: mutatorRegisteredAsZ, a: mutatorRegisteredAsA },
    );
    expect(scoreResult.score).toBe(60);
    expect(scoreResult.mutatorsApplied).toEqual(["a", "z"]);
  });

  it("throws when active criterion weights sum to zero", () => {
    const zeroWeightCriterion: Criterion = {
      name: "C",
      evaluate: () => ({ score: 10, justification: "c" }),
    };
    const config: ScoringConfig = {
      thresholds,
      criteria: { c: { weight: 0 } },
    };
    expect(() =>
      scoreWithRegistries(minimalContext(), config, { c: zeroWeightCriterion }, {}),
    ).toThrow(/Sum of active criterion weights/);
  });

  it("throws when a mutator returns a non-positive factor", () => {
    const baselineCriterion: Criterion = {
      name: "C",
      evaluate: () => ({ score: 10, justification: "c" }),
    };
    const zeroFactorMutator: Mutator = {
      name: "bad",
      apply: () => 0,
    };
    const config: ScoringConfig = {
      thresholds,
      criteria: { c: { weight: 100 } },
      mutators: { bad: {} },
    };
    expect(() =>
      scoreWithRegistries(
        minimalContext(),
        config,
        { c: baselineCriterion },
        { bad: zeroFactorMutator },
      ),
    ).toThrow(/invalid factor/);
  });
});

describe("tier boundaries", () => {
  const singleCriterionConfig: ScoringConfig = {
    thresholds: { low: 30, medium: 60 },
    criteria: { c: { weight: 100 } },
  };

  const criterionAt = (rawScore: number): Criterion => ({
    name: "C",
    evaluate: () => ({ score: rawScore, justification: `raw ${rawScore}` }),
  });

  it("score at low threshold is LOW", () => {
    const scoreResult = scoreWithRegistries(
      minimalContext(),
      singleCriterionConfig,
      { c: criterionAt(30) },
      {},
    );
    expect(scoreResult.tier).toBe("LOW");
  });

  it("score just above low threshold is MEDIUM", () => {
    const scoreResult = scoreWithRegistries(
      minimalContext(),
      singleCriterionConfig,
      { c: criterionAt(31) },
      {},
    );
    expect(scoreResult.tier).toBe("MEDIUM");
  });

  it("score at medium threshold is MEDIUM", () => {
    const scoreResult = scoreWithRegistries(
      minimalContext(),
      singleCriterionConfig,
      { c: criterionAt(60) },
      {},
    );
    expect(scoreResult.tier).toBe("MEDIUM");
  });

  it("score just above medium threshold is HIGH", () => {
    const scoreResult = scoreWithRegistries(
      minimalContext(),
      singleCriterionConfig,
      { c: criterionAt(61) },
      {},
    );
    expect(scoreResult.tier).toBe("HIGH");
  });
});

describe("missing criterion implementation", () => {
  it("records configured id in disabledCriteria when no implementation exists", () => {
    const config: ScoringConfig = {
      thresholds,
      criteria: { ghost: { weight: 100 } },
    };
    const scoreResult = scoreWithRegistries(minimalContext(), config, {}, {});
    expect(scoreResult.disabledCriteria).toContain("ghost");
    expect(scoreResult.score).toBe(0);
    expect(scoreResult.tier).toBe("LOW");
  });
});
