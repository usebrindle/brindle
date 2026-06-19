/**
 * Unit tests for pure author-familiarity analysis at merge-base.
 *
 * @see docs/designs/lld-author-familiarity-criterion.md
 */
import { describe, expect, it, vi } from "vitest";

import {
  analyzeFamiliarity,
  characterizeFamiliarity,
  shareOfCurrentContent,
} from "../core/contextual/familiarity.js";
import type {
  FamiliarityInput,
  GitBlameSource,
  GitBlameStats,
  GitHistorySource,
  GitHistoryStats,
} from "../core/contextual/familiarity.types.js";

const CLASSIFIED_AT = new Date("2026-06-18T12:00:00.000Z");
const AUTHOR_EMAIL = "author@example.com";

const daysBeforeClassifiedAt = (dayCount: number): Date =>
  new Date(CLASSIFIED_AT.getTime() - dayCount * 24 * 60 * 60 * 1000);

const createMockHistorySource = (
  statsByPath: Readonly<Record<string, GitHistoryStats>>,
): GitHistorySource => ({
  query: ({ path }) =>
    statsByPath[path] ?? {
      authorCommitCount: 0,
      totalFileCommitCount: 0,
      lastTouchDate: null,
    },
});

const createMockBlameSource = (
  statsByPath: Readonly<Record<string, GitBlameStats>>,
): GitBlameSource => ({
  query: ({ path }) =>
    statsByPath[path] ?? {
      authorOwnedLineCount: 0,
      totalBlameableLineCount: 0,
      authorChangedLineCount: 0,
      totalChangedLineCount: 0,
    },
});

const createFamiliarityInput = (
  overrides: Partial<FamiliarityInput> & Pick<FamiliarityInput, "changedFiles">,
): FamiliarityInput => ({
  authorEmails: [AUTHOR_EMAIL],
  historySource: createMockHistorySource({}),
  blameSource: createMockBlameSource({}),
  baseRevision: "merge-base-sha",
  classifiedAt: CLASSIFIED_AT,
  ...overrides,
});

describe("characterizeFamiliarity", () => {
  it("returns none for 1 pre-PR commit 90 days ago with 0% line ownership (not moderate)", () => {
    const result = characterizeFamiliarity(
      1,
      5,
      daysBeforeClassifiedAt(90),
      CLASSIFIED_AT,
      0,
      0,
    );

    expect(result.characterization).toBe("none");
  });

  it("returns high when recent rewrite has high line share", () => {
    const result = characterizeFamiliarity(
      1,
      4,
      daysBeforeClassifiedAt(30),
      CLASSIFIED_AT,
      0.5,
      0,
    );

    expect(result.characterization).toBe("high");
  });
});

describe("analyzeFamiliarity", () => {
  it("returns none for first-touch legacy file with zero pre-PR commits", () => {
    const findings = analyzeFamiliarity(
      createFamiliarityInput({
        changedFiles: [{ path: "src/legacy.ts", changeKind: "modified" }],
        historySource: createMockHistorySource({
          "src/legacy.ts": {
            authorCommitCount: 0,
            totalFileCommitCount: 12,
            lastTouchDate: null,
          },
        }),
        blameSource: createMockBlameSource({
          "src/legacy.ts": {
            authorOwnedLineCount: 0,
            totalBlameableLineCount: 100,
            authorChangedLineCount: 0,
            totalChangedLineCount: 0,
          },
        }),
      }),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.characterization).toBe("none");
    expect(findings[0]?.changeKind).toBe("modified");
    expect(findings[0]?.authorCommitCount).toBe(0);
  });

  it("returns high for added file via greenfield gate without git queries", () => {
    const historyQuery = vi.fn();
    const blameQuery = vi.fn();

    const findings = analyzeFamiliarity(
      createFamiliarityInput({
        changedFiles: [{ path: "src/new-feature.ts", changeKind: "added" }],
        historySource: { query: historyQuery },
        blameSource: { query: blameQuery },
      }),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      touchedFile: "src/new-feature.ts",
      changeKind: "added",
      authorOwnedLineCount: 0,
      totalBlameableLineCount: 0,
      shareOfCurrentContent: 0,
      authorChangedLineCount: 0,
      totalChangedLineCount: 0,
      shareOfWindowedLineChurn: 0,
      authorCommitCount: 0,
      totalFileCommitCount: 0,
      lastTouchDate: null,
      shareOfFileCommitChurn: 0,
      characterization: "high",
    });
    expect(historyQuery).not.toHaveBeenCalled();
    expect(blameQuery).not.toHaveBeenCalled();
  });

  it("returns high for pre-PR single-rewrite with high line share", () => {
    const findings = analyzeFamiliarity(
      createFamiliarityInput({
        changedFiles: [{ path: "src/owned.ts", changeKind: "modified" }],
        historySource: createMockHistorySource({
          "src/owned.ts": {
            authorCommitCount: 1,
            totalFileCommitCount: 3,
            lastTouchDate: daysBeforeClassifiedAt(45),
          },
        }),
        blameSource: createMockBlameSource({
          "src/owned.ts": {
            authorOwnedLineCount: 80,
            totalBlameableLineCount: 100,
            authorChangedLineCount: 80,
            totalChangedLineCount: 100,
          },
        }),
      }),
    );

    expect(findings[0]?.characterization).toBe("high");
    expect(shareOfCurrentContent(80, 100)).toBe(0.8);
  });

  it("returns none for single recent commit with zero line ownership", () => {
    const findings = analyzeFamiliarity(
      createFamiliarityInput({
        changedFiles: [{ path: "src/touched-once.ts", changeKind: "modified" }],
        historySource: createMockHistorySource({
          "src/touched-once.ts": {
            authorCommitCount: 1,
            totalFileCommitCount: 8,
            lastTouchDate: daysBeforeClassifiedAt(90),
          },
        }),
        blameSource: createMockBlameSource({
          "src/touched-once.ts": {
            authorOwnedLineCount: 0,
            totalBlameableLineCount: 50,
            authorChangedLineCount: 0,
            totalChangedLineCount: 20,
          },
        }),
      }),
    );

    expect(findings[0]?.characterization).toBe("none");
  });

  it("aggregates stats across multiple author emails", () => {
    const findings = analyzeFamiliarity(
      createFamiliarityInput({
        authorEmails: ["primary@example.com", "noreply@users.noreply.github.com"],
        changedFiles: [{ path: "src/multi-email.ts", changeKind: "modified" }],
        historySource: {
          query: ({ authorEmail, path }) => {
            if (path !== "src/multi-email.ts") {
              return { authorCommitCount: 0, totalFileCommitCount: 0, lastTouchDate: null };
            }
            if (authorEmail === "primary@example.com") {
              return {
                authorCommitCount: 1,
                totalFileCommitCount: 4,
                lastTouchDate: daysBeforeClassifiedAt(100),
              };
            }
            return {
              authorCommitCount: 2,
              totalFileCommitCount: 4,
              lastTouchDate: daysBeforeClassifiedAt(40),
            };
          },
        },
        blameSource: {
          query: ({ authorEmail, path }) => {
            if (path !== "src/multi-email.ts") {
              return {
                authorOwnedLineCount: 0,
                totalBlameableLineCount: 0,
                authorChangedLineCount: 0,
                totalChangedLineCount: 0,
              };
            }
            if (authorEmail === "primary@example.com") {
              return {
                authorOwnedLineCount: 10,
                totalBlameableLineCount: 40,
                authorChangedLineCount: 5,
                totalChangedLineCount: 20,
              };
            }
            return {
              authorOwnedLineCount: 15,
              totalBlameableLineCount: 40,
              authorChangedLineCount: 8,
              totalChangedLineCount: 20,
            };
          },
        },
      }),
    );

    expect(findings[0]?.authorCommitCount).toBe(3);
    expect(findings[0]?.authorOwnedLineCount).toBe(25);
    expect(findings[0]?.lastTouchDate).toEqual(daysBeforeClassifiedAt(40));
  });
});
