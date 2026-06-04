import { describe, expect, it } from "vitest";

import { juniorAuthorMutator } from "../core/mutators/juniorAuthor.js";
import { score } from "../core/index.js";
import type { PRContext, ScoringConfig } from "../core/types.js";

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

describe("juniorAuthorMutator", () => {
  const options = { logins: ["alice", "Bob"], multiplier: 2 };

  it("returns null when author is not in the list", () => {
    expect(juniorAuthorMutator.apply(minimalContext({ author: "charlie" }), options)).toBeNull();
  });

  it("matches logins case-insensitively and ignores surrounding whitespace", () => {
    expect(juniorAuthorMutator.apply(minimalContext({ author: "ALICE" }), options)).toBe(2);
    expect(juniorAuthorMutator.apply(minimalContext({ author: "  bob " }), options)).toBe(2);
  });

  it("returns null when logins list is empty after sanitization", () => {
    expect(juniorAuthorMutator.apply(minimalContext({ author: "alice" }), { logins: ["", "  "], multiplier: 2 })).toBeNull();
  });

  it("returns null when author is blank", () => {
    expect(juniorAuthorMutator.apply(minimalContext({ author: "   " }), options)).toBeNull();
  });

  it("is wired through score() with built-in criteria and mutators", () => {
    const context = minimalContext({
      author: "alice",
      totalAdditions: 100,
      totalDeletions: 0,
    });
    const config: ScoringConfig = {
      thresholds: { low: 30, medium: 60 },
      criteria: {
        diff_size: { weight: 100, options: { max_lines_for_cap: 400 } },
      },
      mutators: {
        junior_author: { options: { logins: ["alice"], multiplier: 2 } },
      },
    };
    const scoreResult = score(context, config);
    expect(scoreResult.mutatorsApplied).toEqual(["junior_author"]);
    expect(scoreResult.score).toBeCloseTo(50, 5);
  });
});
