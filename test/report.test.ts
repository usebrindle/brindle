import { describe, expect, it } from "vitest";

import {
  buildMergeRiskCommentMarkdown,
  buildRiskReport,
  checkConclusionForTier,
} from "../core/report.js";
import type { BuildRiskReportOptions } from "../core/report.types.js";
import type { ScoreResult } from "../core/types.js";

const baseReportOptions = (): BuildRiskReportOptions => ({
  failOnHigh: false,
  autoMergePolicy: { enabled: true, maxEligibleTier: "HIGH" },
  nativeAutoMergeSupported: true,
});

const scoreResultFixture = (overrides: Partial<ScoreResult> = {}): ScoreResult => ({
  score: 42,
  tier: "MEDIUM",
  breakdown: [
    {
      name: "Diff size",
      score: 50,
      weight: 100,
      weighted: 50,
      justification: "100 lines changed",
    },
  ],
  mutatorsApplied: [],
  disabledCriteria: [],
  ...overrides,
});

describe("checkConclusionForTier", () => {
  it("maps LOW to success", () => {
    expect(checkConclusionForTier("LOW", false)).toBe("success");
    expect(checkConclusionForTier("LOW", true)).toBe("success");
  });

  it("maps MEDIUM to neutral", () => {
    expect(checkConclusionForTier("MEDIUM", false)).toBe("neutral");
    expect(checkConclusionForTier("MEDIUM", true)).toBe("neutral");
  });

  it("maps HIGH to action_required unless fail-on-high", () => {
    expect(checkConclusionForTier("HIGH", false)).toBe("action_required");
    expect(checkConclusionForTier("HIGH", true)).toBe("failure");
  });
});

describe("buildRiskReport", () => {
  it("embeds the score result and markdown summary", () => {
    const scoreResult = scoreResultFixture();
    const report = buildRiskReport(scoreResult, baseReportOptions());
    expect(report.result).toBe(scoreResult);
    expect(report.commentMarkdown).toContain("## Merge risk");
    expect(report.commentMarkdown).toContain("Diff size");
    expect(report.checkConclusion).toBe("neutral");
    expect(report.autoMergeOutcome).toBe("eligible");
  });

  it("sets auto-merge to skipped when disabled in policy", () => {
    const scoreResult = scoreResultFixture({ tier: "LOW" });
    const report = buildRiskReport(scoreResult, {
      ...baseReportOptions(),
      autoMergePolicy: { enabled: false, maxEligibleTier: "HIGH" },
    });
    expect(report.autoMergeOutcome).toBe("skipped");
  });

  it("sets auto-merge to not_eligible when tier exceeds max eligible", () => {
    const scoreResult = scoreResultFixture({ tier: "HIGH" });
    const report = buildRiskReport(scoreResult, {
      ...baseReportOptions(),
      autoMergePolicy: { enabled: true, maxEligibleTier: "MEDIUM" },
    });
    expect(report.autoMergeOutcome).toBe("not_eligible");
  });

  it("sets auto-merge to unsupported when the platform cannot do native auto-merge", () => {
    const scoreResult = scoreResultFixture({ tier: "LOW" });
    const report = buildRiskReport(scoreResult, {
      ...baseReportOptions(),
      nativeAutoMergeSupported: false,
    });
    expect(report.autoMergeOutcome).toBe("unsupported");
  });

  it("still allows MEDIUM when max eligible is MEDIUM", () => {
    const scoreResult = scoreResultFixture({ tier: "MEDIUM" });
    const report = buildRiskReport(scoreResult, {
      ...baseReportOptions(),
      autoMergePolicy: { enabled: true, maxEligibleTier: "MEDIUM" },
    });
    expect(report.autoMergeOutcome).toBe("eligible");
  });
});

describe("buildMergeRiskCommentMarkdown", () => {
  it("escapes pipes in criterion names for the markdown table", () => {
    const scoreResult = scoreResultFixture({
      breakdown: [
        {
          name: "a|b",
          score: 1,
          weight: 100,
          weighted: 1,
          justification: "x\ny",
        },
      ],
    });
    const markdown = buildMergeRiskCommentMarkdown(scoreResult);
    expect(markdown).toContain("a\\|b");
    expect(markdown).toContain("x y");
  });

  it("lists mutators and disabled criteria when present", () => {
    const scoreResult = scoreResultFixture({
      mutatorsApplied: ["junior"],
      disabledCriteria: ["diff_size"],
    });
    const markdown = buildMergeRiskCommentMarkdown(scoreResult);
    expect(markdown).toContain("junior");
    expect(markdown).toContain("diff_size");
  });

  it("formats fractional values with one decimal in markdown", () => {
    const scoreResult: ScoreResult = {
      score: 41.55,
      tier: "MEDIUM",
      breakdown: [
        {
          name: "A",
          score: 33.33,
          weight: 50,
          weighted: 16.67,
          justification: "j",
        },
      ],
      mutatorsApplied: [],
      disabledCriteria: [],
    };
    const markdown = buildMergeRiskCommentMarkdown(scoreResult);
    expect(markdown).toContain("41.6");
    expect(markdown).toContain("33.3");
    expect(markdown).toContain("16.7");
  });

  it("includes only mutator line when disabled criteria list is empty", () => {
    const markdown = buildMergeRiskCommentMarkdown(
      scoreResultFixture({ mutatorsApplied: ["m1"], disabledCriteria: [] }),
    );
    expect(markdown).toContain("m1");
    expect(markdown).not.toContain("Criteria disabled");
  });
});
