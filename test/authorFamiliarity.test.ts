import { describe, expect, it } from "vitest";

import type { FamiliarityFinding } from "../core/contextual/contextual.types.js";
import { authorFamiliarityCriterion } from "../core/criteria/authorFamiliarity.js";
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

const createFinding = (overrides: Partial<FamiliarityFinding> & Pick<FamiliarityFinding, "touchedFile" | "characterization">): FamiliarityFinding => ({
  changeKind: "modified",
  authorOwnedLineCount: 0,
  totalBlameableLineCount: 100,
  shareOfCurrentContent: 0,
  authorChangedLineCount: 0,
  totalChangedLineCount: 0,
  shareOfWindowedLineChurn: 0,
  authorCommitCount: 0,
  totalFileCommitCount: 0,
  lastTouchDate: null,
  shareOfFileCommitChurn: 0,
  ...overrides,
});

describe("authorFamiliarityCriterion", () => {
  it("scores zero when there are no changed files", () => {
    const criterionResult = authorFamiliarityCriterion.evaluate(baseContext(), {});
    expect(criterionResult.score).toBe(0);
    expect(criterionResult.justification).toBe("No changed files.");
    expect(criterionResult.detail?.findingCount).toBe(0);
  });

  it("maps default characterization scores and aggregates with max", () => {
    const criterionResult = authorFamiliarityCriterion.evaluate(
      baseContext({
        files: [{ path: "src/a.ts", status: "modified", additions: 1, deletions: 0 }],
        contextualEvidence: {
          familiarityFindings: [
            createFinding({ touchedFile: "src/a.ts", characterization: "high" }),
            createFinding({ touchedFile: "src/b.ts", characterization: "none" }),
            createFinding({ touchedFile: "src/c.ts", characterization: "moderate" }),
          ],
          blastRadiusFindings: [],
          notAnalyzedForBlastRadius: [],
          limitations: [],
          enabledExtractors: [],
        },
      }),
      {},
    );

    expect(criterionResult.score).toBe(85);
    expect(criterionResult.justification).toContain("none on `src/b.ts`");
    expect(criterionResult.justification).toContain("Contextual evidence");
    expect(criterionResult.detail?.worstFile).toBe("src/b.ts");
    expect(criterionResult.detail?.worstCharacterization).toBe("none");
    expect(criterionResult.detail?.findingCount).toBe(3);
  });

  it("uses custom characterization_scores from options", () => {
    const criterionResult = authorFamiliarityCriterion.evaluate(
      baseContext({
        files: [{ path: "src/a.ts", status: "modified", additions: 1, deletions: 0 }],
        contextualEvidence: {
          familiarityFindings: [
            createFinding({ touchedFile: "src/a.ts", characterization: "high" }),
            createFinding({ touchedFile: "src/b.ts", characterization: "moderate" }),
          ],
          blastRadiusFindings: [],
          notAnalyzedForBlastRadius: [],
          limitations: [],
          enabledExtractors: [],
        },
      }),
      {
        characterization_scores: {
          high: 5,
          moderate: 95,
          none: 100,
        },
      },
    );

    expect(criterionResult.score).toBe(95);
    expect(criterionResult.detail?.worstFile).toBe("src/b.ts");
  });

  it("scores zero when changed files exist but findings are missing", () => {
    const criterionResult = authorFamiliarityCriterion.evaluate(
      baseContext({
        files: [{ path: "src/a.ts", status: "modified", additions: 1, deletions: 0 }],
      }),
      {},
    );

    expect(criterionResult.score).toBe(0);
    expect(criterionResult.justification).toBe("No familiarity findings on context.");
  });

  it("treats null and non-object options like defaults", () => {
    const context = baseContext({
      files: [{ path: "src/a.ts", status: "modified", additions: 1, deletions: 0 }],
      contextualEvidence: {
        familiarityFindings: [createFinding({ touchedFile: "src/a.ts", characterization: "moderate" })],
        blastRadiusFindings: [],
        notAnalyzedForBlastRadius: [],
        limitations: [],
        enabledExtractors: [],
      },
    });

    expect(authorFamiliarityCriterion.evaluate(context, null).score).toBe(50);
    expect(authorFamiliarityCriterion.evaluate(context, "x").score).toBe(50);
  });

  it("does not self-disable when enabled and files exist", () => {
    const criterionResult = authorFamiliarityCriterion.evaluate(
      baseContext({
        files: [{ path: "src/a.ts", status: "modified", additions: 1, deletions: 0 }],
        contextualEvidence: {
          familiarityFindings: [createFinding({ touchedFile: "src/a.ts", characterization: "high" })],
          blastRadiusFindings: [],
          notAnalyzedForBlastRadius: [],
          limitations: [],
          enabledExtractors: [],
        },
      }),
      {},
    );

    expect(criterionResult.selfDisable).toBeUndefined();
    expect(criterionResult.score).toBe(15);
  });
});

describe("score with built-in author_familiarity", () => {
  const thresholds = { low: 30, medium: 60 } as const;

  it("includes author_familiarity in breakdown when configured", () => {
    const config: ScoringConfig = {
      thresholds,
      criteria: {
        author_familiarity: {
          weight: 100,
          options: {},
        },
      },
    };
    const scoreResult = score(
      baseContext({
        files: [{ path: "src/auth.ts", status: "modified", additions: 1, deletions: 0 }],
        contextualEvidence: {
          familiarityFindings: [createFinding({ touchedFile: "src/auth.ts", characterization: "none" })],
          blastRadiusFindings: [],
          notAnalyzedForBlastRadius: [],
          limitations: [],
          enabledExtractors: [],
        },
      }),
      config,
    );

    expect(scoreResult.breakdown).toHaveLength(1);
    expect(scoreResult.breakdown[0]!.name).toBe("Author familiarity");
    expect(scoreResult.score).toBe(85);
    expect(scoreResult.tier).toBe("HIGH");
  });
});
