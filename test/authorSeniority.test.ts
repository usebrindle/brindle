import { describe, expect, it } from "vitest";

import { authorSeniorityCriterion } from "../core/criteria/authorSeniority.js";
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

describe("authorSeniorityCriterion", () => {
  it("scores zero when no rules are configured", () => {
    const criterionResult = authorSeniorityCriterion.evaluate(baseContext({ author: "alice" }), {});
    expect(criterionResult.score).toBe(0);
    expect(criterionResult.justification).toContain("No author seniority rules");
  });

  it("scores zero when rules array is missing on options object", () => {
    const criterionResult = authorSeniorityCriterion.evaluate(baseContext({ author: "alice" }), { default_score: 80 });
    expect(criterionResult.score).toBe(0);
  });

  it("matches a rule case-insensitively", () => {
    const criterionResult = authorSeniorityCriterion.evaluate(
      baseContext({ author: "AliceDev" }),
      { rules: [{ login: "alicedev", score: 25 }] },
    );
    expect(criterionResult.score).toBe(25);
    expect(criterionResult.justification).toContain("matched");
    expect(criterionResult.detail?.matchedLogin).toBe("alicedev");
    expect(criterionResult.detail?.usedDefault).toBe(false);
  });

  it("uses max score when duplicate login rules exist", () => {
    const criterionResult = authorSeniorityCriterion.evaluate(
      baseContext({ author: "bob" }),
      {
        rules: [
          { login: "bob", score: 20 },
          { login: "BOB", score: 45 },
        ],
      },
    );
    expect(criterionResult.score).toBe(45);
  });

  it("uses default_score when author matches no rule", () => {
    const criterionResult = authorSeniorityCriterion.evaluate(
      baseContext({ author: "stranger" }),
      {
        rules: [{ login: "alice", score: 10 }],
        default_score: 70,
      },
    );
    expect(criterionResult.score).toBe(70);
    expect(criterionResult.detail?.usedDefault).toBe(true);
    expect(criterionResult.justification).toContain("default score (70)");
  });

  it("uses zero default when default_score is missing", () => {
    const criterionResult = authorSeniorityCriterion.evaluate(
      baseContext({ author: "stranger" }),
      { rules: [{ login: "alice", score: 10 }] },
    );
    expect(criterionResult.score).toBe(0);
    expect(criterionResult.justification).toContain("default score is zero");
  });

  it("drops invalid rules and clamps scores", () => {
    const criterionResult = authorSeniorityCriterion.evaluate(
      baseContext({ author: "pat" }),
      {
        rules: [
          { login: "", score: 99 },
          { login: "pat", score: 150 },
          { login: "x", score: Number.NaN },
          { login: "pat", score: 40 },
        ],
      },
    );
    expect(criterionResult.score).toBe(100);
  });

  it("treats null and non-object options like empty rules", () => {
    const ctx = baseContext({ author: "alice" });
    expect(authorSeniorityCriterion.evaluate(ctx, null).score).toBe(0);
    expect(authorSeniorityCriterion.evaluate(ctx, "x").score).toBe(0);
  });

  it("does not match empty author to a rule", () => {
    const criterionResult = authorSeniorityCriterion.evaluate(
      baseContext({ author: "   " }),
      {
        rules: [{ login: "anyone", score: 50 }],
        default_score: 33,
      },
    );
    expect(criterionResult.score).toBe(33);
    expect(criterionResult.detail?.usedDefault).toBe(true);
  });
});

describe("score with built-in author_seniority", () => {
  const thresholds = { low: 30, medium: 60 } as const;

  it("includes author_seniority in breakdown when configured", () => {
    const config: ScoringConfig = {
      thresholds,
      criteria: {
        author_seniority: {
          weight: 100,
          options: {
            rules: [{ login: "dev", score: 15 }],
            default_score: 0,
          },
        },
      },
    };
    const scoreResult = score(baseContext({ author: "dev" }), config);
    expect(scoreResult.breakdown).toHaveLength(1);
    expect(scoreResult.breakdown[0]!.name).toBe("Author seniority");
    expect(scoreResult.score).toBe(15);
    expect(scoreResult.tier).toBe("LOW");
  });
});
