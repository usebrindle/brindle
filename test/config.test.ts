import { describe, expect, it } from "vitest";

import {
  assertValidScoringConfig,
  loadMergeRiskRepositoryYaml,
  loadScoringConfigFromMergeRiskYaml,
  MergeRiskConfigError,
  parseMergeRiskYamlDocument,
} from "../core/config.js";
import { score } from "../core/index.js";
import type { PRContext } from "../core/types.js";

const minimalValidYaml = `
thresholds:
  low: 30
  medium: 60
criteria:
  diff_size:
    weight: 100
    options:
      max_lines_for_cap: 200
`;

describe("loadScoringConfigFromMergeRiskYaml", () => {
  it("returns a ScoringConfig that score() accepts", () => {
    const scoringConfig = loadScoringConfigFromMergeRiskYaml(minimalValidYaml);
    const context: PRContext = {
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
      totalAdditions: 100,
      totalDeletions: 0,
    };
    const scoreResult = score(context, scoringConfig);
    expect(scoreResult.breakdown).toHaveLength(1);
    expect(scoreResult.breakdown[0]!.name).toBe("Diff size");
  });

  it("allows empty criteria map", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria: {}
`;
    const scoringConfig = loadScoringConfigFromMergeRiskYaml(yamlText);
    expect(Object.keys(scoringConfig.criteria)).toHaveLength(0);
  });

  it("allows mutators block with only options", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  diff_size:
    weight: 100
mutators:
  noop:
    enabled: true
    options: {}
`;
    const scoringConfig = loadScoringConfigFromMergeRiskYaml(yamlText);
    expect(scoringConfig.mutators?.noop?.enabled).toBe(true);
  });

  it("throws MergeRiskConfigError on invalid YAML", () => {
    expect(() => loadScoringConfigFromMergeRiskYaml("thresholds: [\n  -")).toThrow(MergeRiskConfigError);
  });

  it("throws when root is not a mapping", () => {
    expect(() => loadScoringConfigFromMergeRiskYaml("[]")).toThrow(MergeRiskConfigError);
  });

  it("throws when thresholds are missing", () => {
    const yamlText = `
criteria:
  diff_size:
    weight: 1
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when a criterion omits weight", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  diff_size:
    enabled: true
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(/weight/i);
  });

  it("throws when criterion weight is not a number", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  diff_size:
    weight: "heavy"
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });
});

describe("loadMergeRiskRepositoryYaml", () => {
  it("returns scoring plus auto_merge when enabled", () => {
    const yamlText = `${minimalValidYaml}
auto_merge:
  enabled: true
  tier: low
  method: merge
`;
    const bundle = loadMergeRiskRepositoryYaml(yamlText);
    expect(bundle.scoringConfig.criteria.diff_size?.weight).toBe(100);
    expect(bundle.autoMerge).toEqual({
      enabled: true,
      maxEligibleTier: "LOW",
      method: "merge",
    });
  });

  it("omits auto_merge when disabled or absent", () => {
    expect(loadMergeRiskRepositoryYaml(minimalValidYaml).autoMerge).toBeUndefined();
    const disabled = `
${minimalValidYaml}
auto_merge:
  enabled: false
`;
    expect(loadMergeRiskRepositoryYaml(disabled).autoMerge).toBeUndefined();
  });

  it("throws when auto_merge.enabled is true but tier is invalid", () => {
    const yamlText = `
${minimalValidYaml}
auto_merge:
  enabled: true
  tier: unknown
  method: squash
`;
    expect(() => loadMergeRiskRepositoryYaml(yamlText)).toThrow(/tier/i);
  });
});

describe("assertValidScoringConfig", () => {
  it("rejects a plain array", () => {
    expect(() => assertValidScoringConfig([])).toThrow(MergeRiskConfigError);
  });

  it("accepts a parsed object from parseMergeRiskYamlDocument", () => {
    const parsedDocument = parseMergeRiskYamlDocument(minimalValidYaml);
    const scoringConfig = assertValidScoringConfig(parsedDocument);
    expect(scoringConfig.criteria.diff_size?.weight).toBe(100);
  });

  it("rejects null and undefined roots", () => {
    expect(() => assertValidScoringConfig(null)).toThrow(/empty/);
    expect(() => assertValidScoringConfig(undefined)).toThrow(/empty/);
  });

  it("rejects non-object roots", () => {
    expect(() => assertValidScoringConfig("yaml")).toThrow(/got string/);
    expect(() => assertValidScoringConfig(42)).toThrow(/got number/);
  });

  it("attaches cause on invalid YAML from load helper", () => {
    try {
      loadScoringConfigFromMergeRiskYaml("{");
      expect.fail("expected MergeRiskConfigError");
    } catch (error) {
      expect(error).toBeInstanceOf(MergeRiskConfigError);
      expect((error as MergeRiskConfigError).cause).toBeDefined();
    }
  });
});
