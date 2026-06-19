import { describe, expect, it } from "vitest";

import type { BlastRadiusFinding } from "../core/contextual/contextual.types.js";
import { blastRadiusCriterion } from "../core/criteria/blastRadius.js";
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

const createFinding = (
  overrides: Partial<BlastRadiusFinding> & Pick<BlastRadiusFinding, "changedFile" | "characterization">,
): BlastRadiusFinding => ({
  directDependentCount: 0,
  directDependents: [],
  transitiveReachCount: 0,
  ...overrides,
});

describe("blastRadiusCriterion", () => {
  it("scores zero when there are no changed files", () => {
    const criterionResult = blastRadiusCriterion.evaluate(baseContext(), {});
    expect(criterionResult.score).toBe(0);
    expect(criterionResult.justification).toBe("No changed files.");
    expect(criterionResult.detail?.findingCount).toBe(0);
  });

  it("maps default characterization scores and aggregates with max", () => {
    const criterionResult = blastRadiusCriterion.evaluate(
      baseContext({
        files: [{ path: "src/a.ts", status: "modified", additions: 1, deletions: 0 }],
        contextualEvidence: {
          familiarityFindings: [],
          blastRadiusFindings: [
            createFinding({
              changedFile: "src/a.ts",
              characterization: "isolated",
              transitiveReachCount: 1,
            }),
            createFinding({
              changedFile: "src/b.ts",
              characterization: "broad",
              transitiveReachCount: 52,
            }),
            createFinding({
              changedFile: "src/c.ts",
              characterization: "moderate",
              transitiveReachCount: 8,
            }),
          ],
          notAnalyzedForBlastRadius: [],
          limitations: [],
          enabledExtractors: ["js_ts"],
        },
      }),
      {},
    );

    expect(criterionResult.score).toBe(90);
    expect(criterionResult.justification).toContain("52 files transitively on `src/b.ts`");
    expect(criterionResult.justification).toContain("Contextual evidence");
    expect(criterionResult.detail?.worstFile).toBe("src/b.ts");
    expect(criterionResult.detail?.worstCharacterization).toBe("broad");
    expect(criterionResult.detail?.transitiveReach).toBe(52);
    expect(criterionResult.detail?.findingCount).toBe(3);
  });

  it("uses custom characterization_scores from options", () => {
    const criterionResult = blastRadiusCriterion.evaluate(
      baseContext({
        files: [{ path: "src/a.ts", status: "modified", additions: 1, deletions: 0 }],
        contextualEvidence: {
          familiarityFindings: [],
          blastRadiusFindings: [
            createFinding({
              changedFile: "src/a.ts",
              characterization: "isolated",
              transitiveReachCount: 0,
            }),
            createFinding({
              changedFile: "src/b.ts",
              characterization: "moderate",
              transitiveReachCount: 5,
            }),
          ],
          notAnalyzedForBlastRadius: [],
          limitations: [],
          enabledExtractors: ["js_ts"],
        },
      }),
      {
        characterization_scores: {
          isolated: 5,
          moderate: 95,
          broad: 100,
        },
      },
    );

    expect(criterionResult.score).toBe(95);
    expect(criterionResult.detail?.worstFile).toBe("src/b.ts");
  });

  it("self-disables when all changed files are unsupported", () => {
    const criterionResult = blastRadiusCriterion.evaluate(
      baseContext({
        files: [
          { path: "README.md", status: "modified", additions: 1, deletions: 0 },
          { path: "notes.txt", status: "modified", additions: 1, deletions: 0 },
        ],
        contextualEvidence: {
          familiarityFindings: [],
          blastRadiusFindings: [],
          notAnalyzedForBlastRadius: [
            { path: "README.md", reason: "no extractor for extension .md" },
            { path: "notes.txt", reason: "no extractor for extension .txt" },
          ],
          limitations: [],
          enabledExtractors: ["js_ts", "stylesheet"],
        },
      }),
      {},
    );

    expect(criterionResult.selfDisable).toBe(true);
    expect(criterionResult.score).toBe(0);
    expect(criterionResult.justification).toBe("No analyzable changed files for blast radius.");
    expect(criterionResult.detail?.notAnalyzed).toHaveLength(2);
  });

  it("scores zero when changed files exist but findings are missing", () => {
    const criterionResult = blastRadiusCriterion.evaluate(
      baseContext({
        files: [{ path: "src/a.ts", status: "modified", additions: 1, deletions: 0 }],
      }),
      {},
    );

    expect(criterionResult.score).toBe(0);
    expect(criterionResult.justification).toBe("No blast radius findings on context.");
    expect(criterionResult.selfDisable).toBeUndefined();
  });

  it("includes notAnalyzed entries in detail when some files are analyzable", () => {
    const criterionResult = blastRadiusCriterion.evaluate(
      baseContext({
        files: [
          { path: "src/a.ts", status: "modified", additions: 1, deletions: 0 },
          { path: "README.md", status: "modified", additions: 1, deletions: 0 },
        ],
        contextualEvidence: {
          familiarityFindings: [],
          blastRadiusFindings: [
            createFinding({
              changedFile: "src/a.ts",
              characterization: "moderate",
              transitiveReachCount: 4,
            }),
          ],
          notAnalyzedForBlastRadius: [{ path: "README.md", reason: "no extractor for extension .md" }],
          limitations: [],
          enabledExtractors: ["js_ts"],
        },
      }),
      {},
    );

    expect(criterionResult.selfDisable).toBeUndefined();
    expect(criterionResult.score).toBe(55);
    expect(criterionResult.detail?.notAnalyzed).toEqual([
      { path: "README.md", reason: "no extractor for extension .md" },
    ]);
  });

  it("treats null and non-object options like defaults", () => {
    const context = baseContext({
      files: [{ path: "src/a.ts", status: "modified", additions: 1, deletions: 0 }],
      contextualEvidence: {
        familiarityFindings: [],
        blastRadiusFindings: [
          createFinding({
            changedFile: "src/a.ts",
            characterization: "moderate",
            transitiveReachCount: 6,
          }),
        ],
        notAnalyzedForBlastRadius: [],
        limitations: [],
        enabledExtractors: ["js_ts"],
      },
    });

    expect(blastRadiusCriterion.evaluate(context, null).score).toBe(55);
    expect(blastRadiusCriterion.evaluate(context, "x").score).toBe(55);
  });
});

describe("score with built-in blast_radius", () => {
  const thresholds = { low: 30, medium: 60 } as const;

  it("includes blast_radius in breakdown when configured", () => {
    const config: ScoringConfig = {
      thresholds,
      criteria: {
        blast_radius: {
          weight: 100,
          options: {},
        },
      },
    };
    const scoreResult = score(
      baseContext({
        files: [{ path: "src/schema.ts", status: "modified", additions: 1, deletions: 0 }],
        contextualEvidence: {
          familiarityFindings: [],
          blastRadiusFindings: [
            createFinding({
              changedFile: "src/schema.ts",
              characterization: "broad",
              transitiveReachCount: 52,
            }),
          ],
          notAnalyzedForBlastRadius: [],
          limitations: [],
          enabledExtractors: ["js_ts"],
        },
      }),
      config,
    );

    expect(scoreResult.breakdown).toHaveLength(1);
    expect(scoreResult.breakdown[0]!.name).toBe("Blast radius");
    expect(scoreResult.score).toBe(90);
    expect(scoreResult.tier).toBe("HIGH");
  });

  it("redistributes weight when blast_radius self-disables", () => {
    const config: ScoringConfig = {
      thresholds,
      criteria: {
        diff_size: { weight: 50, options: { max_lines_for_cap: 100 } },
        blast_radius: { weight: 50, options: {} },
      },
    };
    const scoreResult = score(
      baseContext({
        files: [{ path: "README.md", status: "modified", additions: 1, deletions: 0 }],
        totalAdditions: 5,
        totalDeletions: 5,
        contextualEvidence: {
          familiarityFindings: [],
          blastRadiusFindings: [],
          notAnalyzedForBlastRadius: [{ path: "README.md", reason: "no extractor for extension .md" }],
          limitations: [],
          enabledExtractors: ["js_ts"],
        },
      }),
      config,
    );

    const names = scoreResult.breakdown.map((row) => row.name);
    expect(names).toContain("Diff size");
    expect(names).not.toContain("Blast radius");
  });
});
