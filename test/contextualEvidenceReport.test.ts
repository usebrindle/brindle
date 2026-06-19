/**
 * Unit tests for contextual evidence markdown formatters.
 *
 * @see docs/designs/lld-contextual-evidence-reporting.md
 */
import { describe, expect, it } from "vitest";

import type {
  BlastRadiusFinding,
  FamiliarityFinding,
} from "../core/contextual/contextual.types.js";
import {
  buildContextualEvidencePayload,
  formatBlastRadiusDetail,
  formatContextualEvidencePath,
  formatFamiliarityDetail,
  renderContextualEvidenceMarkdown,
  sortBlastRadiusFindingsForReport,
  sortFamiliarityFindingsForReport,
} from "../core/contextual/report/index.js";
import type { PRContext } from "../core/types.js";

const CLASSIFIED_AT = new Date("2026-06-18T12:00:00.000Z");

const daysBeforeClassifiedAt = (dayCount: number): Date =>
  new Date(CLASSIFIED_AT.getTime() - dayCount * 24 * 60 * 60 * 1000);

const createFamiliarityFinding = (
  overrides: Partial<FamiliarityFinding> & Pick<FamiliarityFinding, "touchedFile" | "characterization">,
): FamiliarityFinding => ({
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

const createBlastRadiusFinding = (
  overrides: Partial<BlastRadiusFinding> & Pick<BlastRadiusFinding, "changedFile" | "characterization">,
): BlastRadiusFinding => ({
  directDependentCount: 0,
  directDependents: [],
  transitiveReachCount: 0,
  ...overrides,
});

describe("formatContextualEvidencePath", () => {
  it("renders repository root alias for dot path", () => {
    expect(formatContextualEvidencePath(".")).toBe("(repository root)");
    expect(formatContextualEvidencePath("src/app.ts")).toBe("src/app.ts");
  });
});

describe("formatFamiliarityDetail", () => {
  it("uses greenfield copy for added files", () => {
    const finding = createFamiliarityFinding({
      touchedFile: "src/newFeature.ts",
      changeKind: "added",
      characterization: "high",
    });

    expect(formatFamiliarityDetail(finding)).toBe(
      "File added in this PR; no prior history on this path. Author is the sole contributor in this change.",
    );
  });

  it("uses pre-PR copy for unfamiliar external contributor on modified file", () => {
    const finding = createFamiliarityFinding({
      touchedFile: "packages/zod/src/types.ts",
      characterization: "none",
      authorOwnedLineCount: 0,
      totalBlameableLineCount: 420,
      shareOfCurrentContent: 0,
      authorChangedLineCount: 0,
      totalChangedLineCount: 180,
      shareOfWindowedLineChurn: 0,
      authorCommitCount: 0,
      totalFileCommitCount: 42,
      lastTouchDate: null,
      shareOfFileCommitChurn: 0,
    });

    expect(formatFamiliarityDetail(finding, { classifiedAt: CLASSIFIED_AT })).toBe(
      "Author owned 0% of lines and 0% of line churn in 6 months before this PR (no author commits in window; 42 commits by others in window).",
    );
  });

  it("uses sole-contributor copy when author owned all blameable lines", () => {
    const finding = createFamiliarityFinding({
      touchedFile: "src/utils.ts",
      characterization: "high",
      authorOwnedLineCount: 80,
      totalBlameableLineCount: 80,
      shareOfCurrentContent: 1,
      authorCommitCount: 2,
      totalFileCommitCount: 2,
      lastTouchDate: CLASSIFIED_AT,
      shareOfFileCommitChurn: 1,
    });

    expect(formatFamiliarityDetail(finding, { classifiedAt: CLASSIFIED_AT })).toBe(
      "Author owned 100% of lines in 6 months before this PR (2 commits, last touch today).",
    );
  });

  it("uses line-first copy with commit activity for typical modified files", () => {
    const finding = createFamiliarityFinding({
      touchedFile: "src/legacy.ts",
      characterization: "moderate",
      authorOwnedLineCount: 62,
      totalBlameableLineCount: 100,
      shareOfCurrentContent: 0.62,
      authorChangedLineCount: 41,
      totalChangedLineCount: 100,
      shareOfWindowedLineChurn: 0.41,
      authorCommitCount: 3,
      totalFileCommitCount: 10,
      lastTouchDate: daysBeforeClassifiedAt(10),
      shareOfFileCommitChurn: 0.3,
    });

    expect(formatFamiliarityDetail(finding, { classifiedAt: CLASSIFIED_AT })).toBe(
      "Author owned 62% of lines and 41% of line churn in 6 months before this PR (3 commits, last touch 10 days ago; 7 commits by others in window).",
    );
  });

  it("uses commit-only phrasing when blameable lines are zero", () => {
    const finding = createFamiliarityFinding({
      touchedFile: "assets/logo.png",
      characterization: "none",
      totalBlameableLineCount: 0,
      authorCommitCount: 0,
      totalFileCommitCount: 5,
    });

    expect(formatFamiliarityDetail(finding, { classifiedAt: CLASSIFIED_AT })).toBe(
      "Author had 0% commit activity in 6 months before this PR (no author commits in window; 5 commits by others in window).",
    );
  });
});

describe("formatBlastRadiusDetail", () => {
  it("leads with transitive reach when direct and transitive counts diverge", () => {
    const finding = createBlastRadiusFinding({
      changedFile: "src/schema.ts",
      characterization: "broad",
      directDependentCount: 1,
      directDependents: ["src/LoginForm.tsx"],
      transitiveReachCount: 52,
    });

    expect(formatBlastRadiusDetail(finding)).toBe(
      "Reach: 52 files transitively (1 direct importer), including `src/LoginForm.tsx`.",
    );
  });

  it("uses equal-count phrasing when transitive matches direct", () => {
    const finding = createBlastRadiusFinding({
      changedFile: "src/utils.ts",
      characterization: "isolated",
      directDependentCount: 2,
      directDependents: ["src/a.tsx", "src/b.tsx"],
      transitiveReachCount: 2,
    });

    expect(formatBlastRadiusDetail(finding)).toBe(
      "Depended on by 2 file(s), including `src/a.tsx`.",
    );
  });

  it("uses files wording for zero dependents", () => {
    const finding = createBlastRadiusFinding({
      changedFile: "src/isolated.ts",
      characterization: "isolated",
      directDependentCount: 0,
      directDependents: [],
      transitiveReachCount: 0,
    });

    expect(formatBlastRadiusDetail(finding)).toBe("Depended on by 0 file(s).");
  });
});

describe("sortFindingsForReport", () => {
  it("sorts familiarity findings by risk tier then path", () => {
    const findings = [
      createFamiliarityFinding({ touchedFile: "src/b.ts", characterization: "high" }),
      createFamiliarityFinding({ touchedFile: "src/a.ts", characterization: "none" }),
      createFamiliarityFinding({ touchedFile: "src/c.ts", characterization: "moderate" }),
    ];

    expect(sortFamiliarityFindingsForReport(findings).map((finding) => finding.touchedFile)).toEqual([
      "src/a.ts",
      "src/c.ts",
      "src/b.ts",
    ]);
  });

  it("sorts blast-radius findings by tier then reach", () => {
    const findings = [
      createBlastRadiusFinding({
        changedFile: "src/low.ts",
        characterization: "isolated",
        transitiveReachCount: 1,
      }),
      createBlastRadiusFinding({
        changedFile: "src/high.ts",
        characterization: "broad",
        transitiveReachCount: 20,
      }),
      createBlastRadiusFinding({
        changedFile: "src/mid.ts",
        characterization: "moderate",
        transitiveReachCount: 8,
      }),
    ];

    expect(sortBlastRadiusFindingsForReport(findings).map((finding) => finding.changedFile)).toEqual([
      "src/high.ts",
      "src/mid.ts",
      "src/low.ts",
    ]);
  });
});

describe("renderContextualEvidenceMarkdown", () => {
  const payload = {
    authorLogin: "external-dev",
    changeNumber: 6098,
    changedFiles: [".", "docs/README.md", "src/newFeature.ts", "packages/zod/src/types.ts"],
    familiarity: [
      createFamiliarityFinding({
        touchedFile: "src/newFeature.ts",
        changeKind: "added",
        characterization: "high",
      }),
      createFamiliarityFinding({
        touchedFile: "packages/zod/src/types.ts",
        characterization: "none",
        authorOwnedLineCount: 0,
        totalBlameableLineCount: 200,
        authorCommitCount: 0,
        totalFileCommitCount: 42,
      }),
    ],
    blastRadius: [
      createBlastRadiusFinding({
        changedFile: "src/schema.ts",
        characterization: "broad",
        directDependentCount: 1,
        directDependents: ["src/LoginForm.tsx"],
        transitiveReachCount: 52,
      }),
    ],
    notAnalyzedForBlastRadius: [
      { path: "docs/README.md", reason: "no extractor for extension .md" },
      { path: "packages/citty/index.ts", reason: "dependency-only path not in changed set" },
    ],
    limitations: [
      "Familiarity uses git blame and git log at merge-base; PR commits excluded",
      "Transitive reach follows static import edges only",
    ],
    enabledExtractors: ["js_ts", "stylesheet"],
    historyWindowDays: 180,
    classifiedAtIso: CLASSIFIED_AT.toISOString(),
  };

  it("renders sorted sections with changed files, limitations, and not-analyzed list", () => {
    const markdown = renderContextualEvidenceMarkdown(payload);

    expect(markdown).toContain("Changed files (4):");
    expect(markdown).toContain("  (repository root)");
    expect(markdown).toContain("### Familiarity");
    expect(markdown).toContain("last 180 days");
    expect(markdown).toContain("`packages/zod/src/types.ts` — none");
    expect(markdown).toContain("no author commits in window; 42 commits by others in window");
    expect(markdown).toContain("`src/newFeature.ts` — high");
    expect(markdown).toContain("File added in this PR; no prior history on this path");
    expect(markdown).toContain("### Blast radius");
    expect(markdown).toContain("Reach: 52 files transitively");
    expect(markdown).toContain("### Not analyzed for blast radius");
    expect(markdown).toContain("docs/README.md — no extractor for extension .md");
    expect(markdown).toContain("### Limitations");
    expect(markdown).toContain("- Familiarity uses git blame and git log at merge-base");

    const familiaritySection = markdown.split("### Blast radius")[0] ?? "";
    const noneFindingIndex = familiaritySection.indexOf("`packages/zod/src/types.ts` — none");
    const highFindingIndex = familiaritySection.indexOf("`src/newFeature.ts` — high");
    expect(noneFindingIndex).toBeGreaterThan(-1);
    expect(highFindingIndex).toBeGreaterThan(-1);
    expect(noneFindingIndex).toBeLessThan(highFindingIndex);
  });
});

describe("buildContextualEvidencePayload", () => {
  it("assembles payload from hydrated PRContext", () => {
    const pullRequestContext: PRContext = {
      repoSlug: "colinhacks/zod",
      changeNumber: 6098,
      headSha: "abc",
      baseRef: "main",
      author: "external-dev",
      title: "Fix types",
      body: "",
      labels: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      classifiedAtIso: CLASSIFIED_AT.toISOString(),
      files: [
        { path: "src/b.ts", status: "modified", additions: 1, deletions: 0 },
        { path: "src/a.ts", status: "added", additions: 10, deletions: 0 },
      ],
      totalAdditions: 11,
      totalDeletions: 0,
      contextualEvidence: {
        familiarityFindings: [
          createFamiliarityFinding({ touchedFile: "src/a.ts", changeKind: "added", characterization: "high" }),
        ],
        blastRadiusFindings: [],
        notAnalyzedForBlastRadius: [],
        limitations: ["test limitation"],
        enabledExtractors: ["js_ts"],
      },
    };

    const payload = buildContextualEvidencePayload(pullRequestContext, { historyWindowDays: 180 });

    expect(payload).not.toBeNull();
    expect(payload?.authorLogin).toBe("external-dev");
    expect(payload?.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(payload?.historyWindowDays).toBe(180);
    expect(payload?.limitations).toEqual(["test limitation"]);
  });

  it("returns null when contextual evidence snapshot is absent", () => {
    const pullRequestContext: PRContext = {
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
    };

    expect(buildContextualEvidencePayload(pullRequestContext)).toBeNull();
  });
});
