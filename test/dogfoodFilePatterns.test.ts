import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadScoringConfigFromMergeRiskYaml } from "../core/config.js";
import { score } from "../core/index.js";
import type { PRContext } from "../core/types.js";

const repositoryRootDirectory = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");

const mergeRiskFixtureContext = (files: PRContext["files"]): PRContext => ({
  repoSlug: "usebrindle/brindle",
  changeNumber: 999,
  headSha: "abc",
  baseRef: "main",
  author: "test",
  title: "Dogfood fixture",
  body: "",
  labels: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  files,
  totalAdditions: 2,
  totalDeletions: 0,
});

describe("dogfood file_patterns (reads repo .merge-risk.yml)", () => {
  const mergeRiskYamlText = readFileSync(path.join(repositoryRootDirectory, ".merge-risk.yml"), "utf8");
  const scoringConfig = loadScoringConfigFromMergeRiskYaml(mergeRiskYamlText);

  it("gives file_patterns a non-zero raw score when a changed path matches schema/**", () => {
    const scoreResult = score(
      mergeRiskFixtureContext([
        { path: "schema/merge-risk-config.schema.json", status: "modified", additions: 1, deletions: 0 },
      ]),
      scoringConfig,
    );
    const filePatternsBreakdown = scoreResult.breakdown.find((row) => row.name === "File patterns");
    expect(filePatternsBreakdown).toBeDefined();
    expect(filePatternsBreakdown!.score).toBeGreaterThan(0);
  });

  it("gives file_patterns a zero raw score when changed paths do not match dogfood globs", () => {
    const scoreResult = score(
      mergeRiskFixtureContext([{ path: "README.md", status: "modified", additions: 1, deletions: 0 }]),
      scoringConfig,
    );
    const filePatternsBreakdown = scoreResult.breakdown.find((row) => row.name === "File patterns");
    expect(filePatternsBreakdown).toBeDefined();
    expect(filePatternsBreakdown!.score).toBe(0);
  });
});
