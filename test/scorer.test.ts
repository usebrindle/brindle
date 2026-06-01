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
    const r = scoreWithRegistries(minimalContext(), config, {}, {});
    expect(r.score).toBe(0);
    expect(r.tier).toBe("LOW");
    expect(r.breakdown).toEqual([]);
    expect(r.mutatorsApplied).toEqual([]);
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
    const a: Criterion = {
      name: "A",
      evaluate: () => ({ score: 40, justification: "a" }),
    };
    const b: Criterion = {
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
    const r = scoreWithRegistries(minimalContext(), config, { a, b }, {});
    expect(r.score).toBeCloseTo(50, 10);
    expect(r.tier).toBe("MEDIUM");
    expect(r.breakdown).toHaveLength(2);
    expect(r.breakdown[0]!.name).toBe("A");
    expect(r.breakdown[0]!.weight).toBeCloseTo(50, 10);
  });

  it("drops self-disabled criteria and redistributes weight", () => {
    const a: Criterion = {
      name: "A",
      evaluate: () => ({ score: 99, justification: "skip", selfDisable: true }),
    };
    const b: Criterion = {
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
    const r = scoreWithRegistries(minimalContext(), config, { a, b }, {});
    expect(r.disabledCriteria).toContain("a");
    expect(r.score).toBe(80);
    expect(r.breakdown).toHaveLength(1);
    expect(r.breakdown[0]!.weight).toBeCloseTo(100, 10);
  });

  it("respects isEnabled and lists disabled config entries", () => {
    const a: Criterion = {
      name: "A",
      isEnabled: () => false,
      evaluate: () => ({ score: 0, justification: "never" }),
    };
    const b: Criterion = {
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
    const r = scoreWithRegistries(minimalContext(), config, { a, b }, {});
    expect(r.disabledCriteria).toContain("a");
    expect(r.score).toBe(40);
  });

  it("applies mutators with deterministic ordering in mutatorsApplied", () => {
    const c: Criterion = {
      name: "C",
      evaluate: () => ({ score: 10, justification: "c" }),
    };
    const mLate: Mutator = {
      name: "late",
      apply: () => 3,
    };
    const mEarly: Mutator = {
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
    const r = scoreWithRegistries(
      minimalContext(),
      config,
      { c },
      { z: mLate, a: mEarly },
    );
    expect(r.score).toBe(60);
    expect(r.mutatorsApplied).toEqual(["a", "z"]);
  });

  it("throws when active criterion weights sum to zero", () => {
    const c: Criterion = {
      name: "C",
      evaluate: () => ({ score: 10, justification: "c" }),
    };
    const config: ScoringConfig = {
      thresholds,
      criteria: { c: { weight: 0 } },
    };
    expect(() => scoreWithRegistries(minimalContext(), config, { c }, {})).toThrow(
      /Sum of active criterion weights/,
    );
  });

  it("throws when a mutator returns a non-positive factor", () => {
    const c: Criterion = {
      name: "C",
      evaluate: () => ({ score: 10, justification: "c" }),
    };
    const bad: Mutator = {
      name: "bad",
      apply: () => 0,
    };
    const config: ScoringConfig = {
      thresholds,
      criteria: { c: { weight: 100 } },
      mutators: { bad: {} },
    };
    expect(() => scoreWithRegistries(minimalContext(), config, { c }, { bad })).toThrow(
      /invalid factor/,
    );
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
    const r = scoreWithRegistries(
      minimalContext(),
      singleCriterionConfig,
      { c: criterionAt(30) },
      {},
    );
    expect(r.tier).toBe("LOW");
  });

  it("score just above low threshold is MEDIUM", () => {
    const r = scoreWithRegistries(
      minimalContext(),
      singleCriterionConfig,
      { c: criterionAt(31) },
      {},
    );
    expect(r.tier).toBe("MEDIUM");
  });

  it("score at medium threshold is MEDIUM", () => {
    const r = scoreWithRegistries(
      minimalContext(),
      singleCriterionConfig,
      { c: criterionAt(60) },
      {},
    );
    expect(r.tier).toBe("MEDIUM");
  });

  it("score just above medium threshold is HIGH", () => {
    const r = scoreWithRegistries(
      minimalContext(),
      singleCriterionConfig,
      { c: criterionAt(61) },
      {},
    );
    expect(r.tier).toBe("HIGH");
  });
});

describe("missing criterion implementation", () => {
  it("records configured id in disabledCriteria when no implementation exists", () => {
    const config: ScoringConfig = {
      thresholds,
      criteria: { ghost: { weight: 100 } },
    };
    const r = scoreWithRegistries(minimalContext(), config, {}, {});
    expect(r.disabledCriteria).toContain("ghost");
    expect(r.score).toBe(0);
    expect(r.tier).toBe("LOW");
  });
});
