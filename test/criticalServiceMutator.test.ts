import { describe, expect, it } from "vitest";

import { criticalServiceMutator } from "../core/mutators/criticalService.js";
import { score } from "../core/index.js";
import type { PRContext, ScoringConfig } from "../core/types.js";
import type { ServicesCatalog } from "../core/criteria/serviceCriticality.types.js";

const catalog: ServicesCatalog = {
  payments: { globs: ["src/payments/**"] },
  docs_only: { globs: ["docs/**"] },
};

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

describe("criticalServiceMutator", () => {
  const mergedOptions = {
    service_ids: ["payments"],
    multiplier: 2,
    services: catalog,
  };

  it("returns null when no changed paths touch a listed service", () => {
    const context = minimalContext({
      files: [{ path: "README.md", status: "modified", additions: 1, deletions: 0 }],
    });
    expect(criticalServiceMutator.apply(context, mergedOptions)).toBeNull();
  });

  it("returns multiplier when a changed path matches a listed service", () => {
    const context = minimalContext({
      files: [{ path: "src/payments/foo.ts", status: "modified", additions: 1, deletions: 0 }],
    });
    expect(criticalServiceMutator.apply(context, mergedOptions)).toBe(2);
  });

  it("returns null when services catalog is missing from merged options", () => {
    const context = minimalContext({
      files: [{ path: "src/payments/foo.ts", status: "modified", additions: 1, deletions: 0 }],
    });
    expect(
      criticalServiceMutator.apply(context, { service_ids: ["payments"], multiplier: 2 }),
    ).toBeNull();
  });

  it("returns null when service_ids is empty after sanitization", () => {
    const context = minimalContext({
      files: [{ path: "src/payments/foo.ts", status: "modified", additions: 1, deletions: 0 }],
    });
    expect(criticalServiceMutator.apply(context, { ...mergedOptions, service_ids: ["", "  "] })).toBeNull();
  });

  it("is wired through score() with root services and built-in mutators", () => {
    const servicesBlock: ServicesCatalog = {
      api: { globs: ["schema/**"] },
    };
    const context = minimalContext({
      files: [{ path: "schema/merge-risk-config.schema.json", status: "modified", additions: 1, deletions: 0 }],
      totalAdditions: 1,
      totalDeletions: 0,
    });
    const config: ScoringConfig = {
      thresholds: { low: 30, medium: 60 },
      services: servicesBlock,
      criteria: {
        diff_size: { weight: 100, options: { max_lines_for_cap: 400 } },
      },
      mutators: {
        critical_service: { options: { service_ids: ["api"], multiplier: 1.5 } },
      },
    };
    const scoreResult = score(context, config);
    expect(scoreResult.mutatorsApplied).toEqual(["critical_service"]);
    expect(scoreResult.score).toBeGreaterThan(0);
  });
});
