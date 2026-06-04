import { describe, expect, it } from "vitest";

import {
  assertValidScoringConfig,
  loadMergeRiskRepositoryYaml,
  loadScoringConfigFromMergeRiskYaml,
  MergeRiskConfigError,
  parseMergeRiskAutoMergeSection,
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

  it("accepts file_patterns with valid patterns and optional aggregation", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  file_patterns:
    weight: 100
    options:
      aggregation: max
      patterns:
        - glob: "**/*.sql"
          score: 70
        - glob: "src/auth/**"
          score: 40
`;
    const scoringConfig = loadScoringConfigFromMergeRiskYaml(yamlText);
    expect(scoringConfig.criteria.file_patterns?.weight).toBe(100);
    expect(scoringConfig.criteria.file_patterns?.options).toEqual({
      aggregation: "max",
      patterns: [
        { glob: "**/*.sql", score: 70 },
        { glob: "src/auth/**", score: 40 },
      ],
    });
  });

  it("accepts file_patterns with empty options object", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  file_patterns:
    weight: 1
    options: {}
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).not.toThrow();
  });

  it("accepts file_patterns with no options key", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  file_patterns:
    weight: 1
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).not.toThrow();
  });

  it("throws when file_patterns.options has an unknown property", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  file_patterns:
    weight: 1
    options:
      unknown_flag: true
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when file_patterns.options.patterns entry omits glob", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  file_patterns:
    weight: 1
    options:
      patterns:
        - score: 10
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when file_patterns.options.patterns entry has score above 100", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  file_patterns:
    weight: 1
    options:
      patterns:
        - glob: "**/*.ts"
          score: 101
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when file_patterns.options.aggregation is not max", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  file_patterns:
    weight: 1
    options:
      aggregation: sum
      patterns:
        - glob: "a"
          score: 1
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("accepts author_seniority with valid rules, default_score, and optional aggregation", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  author_seniority:
    weight: 100
    options:
      aggregation: max
      default_score: 70
      rules:
        - login: "alice"
          score: 10
        - login: "bob"
          score: 25
`;
    const scoringConfig = loadScoringConfigFromMergeRiskYaml(yamlText);
    expect(scoringConfig.criteria.author_seniority?.weight).toBe(100);
    expect(scoringConfig.criteria.author_seniority?.options).toEqual({
      aggregation: "max",
      default_score: 70,
      rules: [
        { login: "alice", score: 10 },
        { login: "bob", score: 25 },
      ],
    });
  });

  it("accepts author_seniority with empty options object", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  author_seniority:
    weight: 1
    options: {}
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).not.toThrow();
  });

  it("accepts author_seniority with no options key", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  author_seniority:
    weight: 1
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).not.toThrow();
  });

  it("throws when author_seniority.options has an unknown property", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  author_seniority:
    weight: 1
    options:
      unknown_flag: true
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when author_seniority.options.rules entry omits login", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  author_seniority:
    weight: 1
    options:
      rules:
        - score: 10
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when author_seniority.options.rules entry has score above 100", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  author_seniority:
    weight: 1
    options:
      rules:
        - login: "pat"
          score: 101
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when author_seniority.options.default_score is above 100", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  author_seniority:
    weight: 1
    options:
      default_score: 101
      rules:
        - login: "pat"
          score: 0
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when author_seniority.options.aggregation is not max", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  author_seniority:
    weight: 1
    options:
      aggregation: sum
      rules:
        - login: "a"
          score: 1
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("accepts service_criticality with services catalog and options", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
services:
  payments:
    globs:
      - "services/payments/**"
  auth:
    globs:
      - "src/auth/**"
criteria:
  diff_size:
    weight: 100
  service_criticality:
    weight: 10
    options:
      aggregation: max
      scores:
        payments: 80
        auth: 55
      default_score: 0
`;
    const scoringConfig = loadScoringConfigFromMergeRiskYaml(yamlText);
    expect(scoringConfig.services?.payments?.globs).toEqual(["services/payments/**"]);
    expect(scoringConfig.services?.auth?.globs).toEqual(["src/auth/**"]);
    expect(scoringConfig.criteria.service_criticality?.weight).toBe(10);
    expect(scoringConfig.criteria.service_criticality?.options).toEqual({
      aggregation: "max",
      scores: { payments: 80, auth: 55 },
      default_score: 0,
    });
  });

  it("accepts service_criticality with empty options object", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  service_criticality:
    weight: 1
    options: {}
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).not.toThrow();
  });

  it("accepts service_criticality with no options key", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  service_criticality:
    weight: 1
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).not.toThrow();
  });

  it("throws when service_criticality.options has an unknown property", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  service_criticality:
    weight: 1
    options:
      unknown_flag: true
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when service_criticality.options.scores value is above 100", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  service_criticality:
    weight: 1
    options:
      aggregation: max
      scores:
        api: 101
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when service_criticality.options.aggregation is not max", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  service_criticality:
    weight: 1
    options:
      aggregation: sum
      scores:
        api: 10
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when services entry omits globs", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
services:
  broken: {}
criteria:
  diff_size:
    weight: 100
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when services entry has empty globs array", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
services:
  empty_globs:
    globs: []
criteria:
  diff_size:
    weight: 100
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

describe("parseMergeRiskAutoMergeSection", () => {
  it("returns undefined when auto_merge is absent, null, or disabled", () => {
    expect(parseMergeRiskAutoMergeSection({})).toBeUndefined();
    expect(parseMergeRiskAutoMergeSection({ auto_merge: null })).toBeUndefined();
    expect(parseMergeRiskAutoMergeSection({ auto_merge: { enabled: false } })).toBeUndefined();
  });

  it("throws when auto_merge is present but not a YAML mapping", () => {
    expect(() => parseMergeRiskAutoMergeSection({ auto_merge: [] })).toThrow(
      /auto_merge must be a YAML mapping/,
    );
    expect(() => parseMergeRiskAutoMergeSection({ auto_merge: "nope" })).toThrow(
      /auto_merge must be a YAML mapping/,
    );
    expect(() => parseMergeRiskAutoMergeSection({ auto_merge: 1 })).toThrow(
      /auto_merge must be a YAML mapping/,
    );
  });

  it("throws when auto_merge.enabled is true but tier or method is not a string", () => {
    expect(() =>
      parseMergeRiskAutoMergeSection({
        auto_merge: { enabled: true, tier: 1, method: "squash" },
      }),
    ).toThrow(/tier and method must be strings/);
    expect(() =>
      parseMergeRiskAutoMergeSection({
        auto_merge: { enabled: true, tier: "low", method: null },
      }),
    ).toThrow(/tier and method must be strings/);
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
