import { describe, expect, it } from "vitest";

import { builtInCriteria } from "../core/criteria/builtins.js";
import { serviceCriticalityCriterion } from "../core/criteria/serviceCriticality.js";
import { loadScoringConfigFromMergeRiskYaml } from "../core/config.js";
import { builtInMutators } from "../core/mutators/builtins.js";
import { scoreWithRegistries } from "../core/scorer.js";
import type { PRContext } from "../core/types.js";

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

const mergedOptions = (criterionOptions: Record<string, unknown>, services: Record<string, { globs: string[] }>) => ({
  ...criterionOptions,
  services,
});

describe("serviceCriticalityCriterion", () => {
  it("uses default score when there are no changed files", () => {
    const criterionResult = serviceCriticalityCriterion.evaluate(
      baseContext({ files: [] }),
      mergedOptions({ aggregation: "max", scores: { pay: 90 }, default_score: 12 }, { pay: { globs: ["**/*"] } }),
    );
    expect(criterionResult.score).toBe(12);
    expect(criterionResult.justification).toContain("No changed files");
  });

  it("uses default score when no services catalog is present on options", () => {
    const criterionResult = serviceCriticalityCriterion.evaluate(
      baseContext({ files: [{ path: "src/a.ts", status: "modified", additions: 1, deletions: 0 }] }),
      { aggregation: "max", scores: { pay: 90 }, default_score: 5 },
    );
    expect(criterionResult.score).toBe(5);
    expect(criterionResult.justification).toContain("No services catalog");
  });

  it("uses default score when no path matches any service glob", () => {
    const criterionResult = serviceCriticalityCriterion.evaluate(
      baseContext({ files: [{ path: "README.md", status: "modified", additions: 1, deletions: 0 }] }),
      mergedOptions(
        { aggregation: "max", scores: { pay: 90 }, default_score: 3 },
        { pay: { globs: ["services/payments/**"] } },
      ),
    );
    expect(criterionResult.score).toBe(3);
    expect(criterionResult.detail?.matchedServices).toBe(false);
  });

  it("returns configured score when a path matches one service", () => {
    const criterionResult = serviceCriticalityCriterion.evaluate(
      baseContext({
        files: [{ path: "services/payments/api.ts", status: "modified", additions: 2, deletions: 0 }],
      }),
      mergedOptions(
        { aggregation: "max", scores: { pay: 77 }, default_score: 0 },
        { pay: { globs: ["services/payments/**"] } },
      ),
    );
    expect(criterionResult.score).toBe(77);
    expect(criterionResult.detail?.touchedServiceIds).toEqual(["pay"]);
    expect(criterionResult.detail?.matchedServices).toBe(true);
  });

  it("uses max score when multiple services are touched", () => {
    const criterionResult = serviceCriticalityCriterion.evaluate(
      baseContext({
        files: [
          { path: "services/payments/a.ts", status: "modified", additions: 1, deletions: 0 },
          { path: "src/auth/b.ts", status: "modified", additions: 1, deletions: 0 },
        ],
      }),
      mergedOptions(
        {
          aggregation: "max",
          scores: { pay: 40, auth: 85 },
          default_score: 0,
        },
        {
          pay: { globs: ["services/payments/**"] },
          auth: { globs: ["src/auth/**"] },
        },
      ),
    );
    expect(criterionResult.score).toBe(85);
    expect((criterionResult.detail?.touchedServiceIds as string[]).sort()).toEqual(["auth", "pay"]);
  });

  it("treats missing score for a touched service as zero when taking max", () => {
    const criterionResult = serviceCriticalityCriterion.evaluate(
      baseContext({
        files: [{ path: "services/payments/a.ts", status: "modified", additions: 1, deletions: 0 }],
      }),
      mergedOptions({ aggregation: "max", scores: { other: 99 }, default_score: 0 }, { pay: { globs: ["**/payments/**"] } }),
    );
    expect(criterionResult.score).toBe(0);
    expect(criterionResult.detail?.touchedServiceIds).toEqual(["pay"]);
  });

  it("scoreWithRegistries merges root services from config for service_criticality", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
services:
  pay:
    globs:
      - "services/payments/**"
criteria:
  service_criticality:
    weight: 100
    options:
      aggregation: max
      scores:
        pay: 66
      default_score: 0
`;
    const scoringConfig = loadScoringConfigFromMergeRiskYaml(yamlText);
    const criteria = {
      ...builtInCriteria,
      service_criticality: serviceCriticalityCriterion,
    };
    const context = baseContext({
      files: [{ path: "services/payments/x.ts", status: "modified", additions: 1, deletions: 0 }],
    });
    const scoreResult = scoreWithRegistries(context, scoringConfig, criteria, builtInMutators);
    const row = scoreResult.breakdown.find((entry) => entry.name === "Service criticality");
    expect(row).toBeDefined();
    expect(row!.score).toBe(66);
  });
});
