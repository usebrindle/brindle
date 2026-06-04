import { describe, expect, it } from "vitest";

import { filePatternsCriterion } from "../core/criteria/filePatterns.js";
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

describe("filePatternsCriterion", () => {
  it("scores zero when no patterns are configured", () => {
    const criterionResult = filePatternsCriterion.evaluate(baseContext({ files: [{ path: "a.sql", status: "modified", additions: 1, deletions: 0 }] }), {});
    expect(criterionResult.score).toBe(0);
    expect(criterionResult.justification).toContain("No file pattern rules");
  });

  it("scores zero when patterns array is missing on options object", () => {
    const criterionResult = filePatternsCriterion.evaluate(
      baseContext({ files: [{ path: "src/x.ts", status: "modified", additions: 1, deletions: 0 }] }),
      {},
    );
    expect(criterionResult.score).toBe(0);
  });

  it("scores zero when there are no changed files", () => {
    const criterionResult = filePatternsCriterion.evaluate(
      baseContext({ files: [] }),
      { patterns: [{ glob: "**/*.sql", score: 80 }] },
    );
    expect(criterionResult.score).toBe(0);
    expect(criterionResult.justification).toContain("No changed files");
  });

  it("matches a simple glob and returns the rule score", () => {
    const criterionResult = filePatternsCriterion.evaluate(
      baseContext({
        files: [{ path: "db/migrate.sql", status: "added", additions: 10, deletions: 0 }],
      }),
      { patterns: [{ glob: "**/*.sql", score: 75 }] },
    );
    expect(criterionResult.score).toBe(75);
    expect(criterionResult.justification).toContain("**/*.sql");
    expect(criterionResult.detail?.matchedGlobs).toEqual(["**/*.sql"]);
  });

  it("uses max score when multiple rules match", () => {
    const criterionResult = filePatternsCriterion.evaluate(
      baseContext({
        files: [
          { path: "lib/a.ts", status: "modified", additions: 1, deletions: 0 },
          { path: "migrations/001.sql", status: "added", additions: 2, deletions: 0 },
        ],
      }),
      {
        patterns: [
          { glob: "**/*.ts", score: 30 },
          { glob: "**/migrations/**", score: 90 },
        ],
      },
    );
    expect(criterionResult.score).toBe(90);
    expect((criterionResult.detail?.matchedGlobs as string[]).sort()).toEqual(["**/*.ts", "**/migrations/**"].sort());
  });

  it("scores zero when nothing matches", () => {
    const criterionResult = filePatternsCriterion.evaluate(
      baseContext({
        files: [{ path: "README.md", status: "modified", additions: 1, deletions: 0 }],
      }),
      { patterns: [{ glob: "**/*.sql", score: 50 }] },
    );
    expect(criterionResult.score).toBe(0);
    expect(criterionResult.justification).toContain("No changed files matched");
  });

  it("drops invalid rules and clamps scores", () => {
    const criterionResult = filePatternsCriterion.evaluate(
      baseContext({
        files: [{ path: "config/.env.local", status: "modified", additions: 1, deletions: 0 }],
      }),
      {
        patterns: [
          { glob: "", score: 99 },
          { glob: "**/.env*", score: 150 },
          { glob: "bad", score: Number.NaN },
          { glob: "**/.env*", score: 60 },
        ],
      },
    );
    expect(criterionResult.score).toBe(100);
  });

  it("treats null and non-object options like empty patterns", () => {
    const ctx = baseContext({
      files: [{ path: "a.sql", status: "modified", additions: 1, deletions: 0 }],
    });
    expect(filePatternsCriterion.evaluate(ctx, null).score).toBe(0);
    expect(filePatternsCriterion.evaluate(ctx, "x").score).toBe(0);
  });
});

describe("score with built-in file_patterns", () => {
  const thresholds = { low: 30, medium: 60 } as const;

  it("includes file_patterns in breakdown when configured", () => {
    const config: ScoringConfig = {
      thresholds,
      criteria: {
        file_patterns: {
          weight: 100,
          options: { patterns: [{ glob: "**/auth/**", score: 40 }] },
        },
      },
    };
    const scoreResult = score(
      baseContext({
        files: [{ path: "src/auth/login.ts", status: "modified", additions: 2, deletions: 1 }],
      }),
      config,
    );
    expect(scoreResult.breakdown).toHaveLength(1);
    expect(scoreResult.breakdown[0]!.name).toBe("File patterns");
    expect(scoreResult.score).toBe(40);
    expect(scoreResult.tier).toBe("MEDIUM");
  });
});
