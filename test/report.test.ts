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
    expect(report.commentMarkdown).toContain("## 🟡 Merge risk — MEDIUM (score 42)");
    expect(report.commentMarkdown).toContain("<details>");
    expect(report.commentMarkdown).toContain("<summary>Score breakdown</summary>");
    expect(report.commentMarkdown).toContain("<!-- brindle-merge-risk -->");
    expect(report.commentMarkdown).toContain("| Diff size |");
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
  it("uses the green verdict line for LOW tier", () => {
    const markdown = buildMergeRiskCommentMarkdown(scoreResultFixture({ tier: "LOW", score: 18 }));
    expect(markdown).toContain("## 🟢 Merge risk — LOW (score 18)");
    expect(markdown).toContain("Low-risk changes are eligible for auto-merge when your policy enables it.");
  });

  it("uses the yellow verdict line for MEDIUM tier", () => {
    const markdown = buildMergeRiskCommentMarkdown(scoreResultFixture({ tier: "MEDIUM", score: 20 }));
    expect(markdown).toContain("## 🟡 Merge risk — MEDIUM (score 20)");
    expect(markdown).toContain("Have a human review this change before merging.");
  });

  it("uses the red verdict line for HIGH tier", () => {
    const markdown = buildMergeRiskCommentMarkdown(scoreResultFixture({ tier: "HIGH", score: 75 }));
    expect(markdown).toContain("## 🔴 Merge risk — HIGH (score 75)");
    expect(markdown).toContain("A human must review and approve this change before merging.");
  });

  it("wraps the criteria table and audit lines in a collapsible score breakdown", () => {
    const markdown = buildMergeRiskCommentMarkdown(
      scoreResultFixture({
        mutatorsApplied: ["junior"],
        disabledCriteria: ["diff_size"],
      }),
    );
    expect(markdown).toContain("<details>");
    expect(markdown).toContain("<summary>Score breakdown</summary>");
    const detailsOpen = markdown.indexOf("<details>");
    const detailsClose = markdown.indexOf("</details>");
    expect(detailsClose).toBeGreaterThan(detailsOpen);
    expect(markdown.indexOf("| Diff size |", detailsOpen)).toBeGreaterThan(-1);
    expect(markdown.indexOf("junior", detailsOpen)).toBeGreaterThan(-1);
    expect(markdown.indexOf("diff_size", detailsOpen)).toBeGreaterThan(-1);
    expect(markdown).toContain("*🐾 Scored by Brindle*");
    expect(markdown).toContain("<!-- brindle-merge-risk -->");
    expect(markdown.endsWith("<!-- brindle-merge-risk -->\n")).toBe(true);
  });

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
