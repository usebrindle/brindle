import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assertValidScoringConfig,
  loadMergeRiskRepositoryYaml,
  loadScoringConfigFromMergeRiskYaml,
  MergeRiskConfigError,
  parseMergeRiskAutoMergeSection,
  parseMergeRiskYamlDocument,
} from "../core/config.js";
import { loadTrustedPlugins, type TrustedPluginsScoringArtifacts } from "../core/plugins/loadTrustedPlugins.js";
import { validateTrustedPluginsPathsStayUnderDirectory } from "../core/plugins/trustedPluginPaths.js";
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

  it("accepts branch_age with max_age_hours_for_cap", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  branch_age:
    weight: 100
    options:
      max_age_hours_for_cap: 240
`;
    const scoringConfig = loadScoringConfigFromMergeRiskYaml(yamlText);
    expect(scoringConfig.criteria.branch_age?.weight).toBe(100);
    expect(scoringConfig.criteria.branch_age?.options).toEqual({ max_age_hours_for_cap: 240 });
  });

  it("accepts branch_age with empty options object", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  branch_age:
    weight: 1
    options: {}
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).not.toThrow();
  });

  it("accepts branch_age with no options key", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  branch_age:
    weight: 1
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).not.toThrow();
  });

  it("throws when branch_age.options has an unknown property", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  branch_age:
    weight: 1
    options:
      unknown_flag: true
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when branch_age.options.max_age_hours_for_cap is zero", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  branch_age:
    weight: 1
    options:
      max_age_hours_for_cap: 0
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when branch_age.options.max_age_hours_for_cap is negative", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  branch_age:
    weight: 1
    options:
      max_age_hours_for_cap: -1
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("accepts diff_size with max_lines_for_cap", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  diff_size:
    weight: 100
    options:
      max_lines_for_cap: 500
`;
    const scoringConfig = loadScoringConfigFromMergeRiskYaml(yamlText);
    expect(scoringConfig.criteria.diff_size?.weight).toBe(100);
    expect(scoringConfig.criteria.diff_size?.options).toEqual({ max_lines_for_cap: 500 });
  });

  it("accepts diff_size with empty options object", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  diff_size:
    weight: 1
    options: {}
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).not.toThrow();
  });

  it("accepts diff_size with no options key", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  diff_size:
    weight: 1
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).not.toThrow();
  });

  it("throws when diff_size.options has an unknown property", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  diff_size:
    weight: 1
    options:
      bogus: 1
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when diff_size.options.max_lines_for_cap is zero", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  diff_size:
    weight: 1
    options:
      max_lines_for_cap: 0
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when diff_size.options.max_lines_for_cap is negative", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  diff_size:
    weight: 1
    options:
      max_lines_for_cap: -10
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("accepts test_coverage with minimum_percent", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  test_coverage:
    weight: 100
    options:
      minimum_percent: 85
`;
    const scoringConfig = loadScoringConfigFromMergeRiskYaml(yamlText);
    expect(scoringConfig.criteria.test_coverage?.weight).toBe(100);
    expect(scoringConfig.criteria.test_coverage?.options).toEqual({ minimum_percent: 85 });
  });

  it("accepts test_coverage with empty options object", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  test_coverage:
    weight: 1
    options: {}
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).not.toThrow();
  });

  it("accepts test_coverage with no options key", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  test_coverage:
    weight: 1
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).not.toThrow();
  });

  it("throws when test_coverage.options has an unknown property", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  test_coverage:
    weight: 1
    options:
      unknown: true
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when test_coverage.options.minimum_percent is zero", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  test_coverage:
    weight: 1
    options:
      minimum_percent: 0
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when test_coverage.options.minimum_percent is above 100", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  test_coverage:
    weight: 1
    options:
      minimum_percent: 101
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("accepts author_familiarity with history_window_days, characterization_scores, aggregation, and author_emails", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  author_familiarity:
    weight: 15
    options:
      history_window_days: 180
      aggregation: max
      characterization_scores:
        high: 10
        moderate: 45
        none: 80
      author_emails:
        - "dev@example.com"
        - "123456+dev@users.noreply.github.com"
`;
    const scoringConfig = loadScoringConfigFromMergeRiskYaml(yamlText);
    expect(scoringConfig.criteria.author_familiarity?.weight).toBe(15);
    expect(scoringConfig.criteria.author_familiarity?.options).toEqual({
      history_window_days: 180,
      aggregation: "max",
      characterization_scores: {
        high: 10,
        moderate: 45,
        none: 80,
      },
      author_emails: ["dev@example.com", "123456+dev@users.noreply.github.com"],
    });
  });

  it("accepts author_familiarity with empty options object", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  author_familiarity:
    weight: 1
    options: {}
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).not.toThrow();
  });

  it("accepts author_familiarity with no options key", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  author_familiarity:
    weight: 1
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).not.toThrow();
  });

  it("throws when author_familiarity.options has an unknown property", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  author_familiarity:
    weight: 1
    options:
      unknown_flag: true
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when author_familiarity.options.history_window_days is zero", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  author_familiarity:
    weight: 1
    options:
      history_window_days: 0
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when author_familiarity.options.characterization_scores has score above 100", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  author_familiarity:
    weight: 1
    options:
      characterization_scores:
        high: 101
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when author_familiarity.options.characterization_scores has unknown tier", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  author_familiarity:
    weight: 1
    options:
      characterization_scores:
        low: 10
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when author_familiarity.options.aggregation is not max", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  author_familiarity:
    weight: 1
    options:
      aggregation: sum
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when author_familiarity.options.author_emails is empty", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  author_familiarity:
    weight: 1
    options:
      author_emails: []
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when author_familiarity.options.author_emails entry is empty string", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  author_familiarity:
    weight: 1
    options:
      author_emails: [""]
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("accepts blast_radius with characterization_scores, enabled_extractors, thresholds, and aggregation", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  blast_radius:
    weight: 20
    options:
      aggregation: max
      characterization_scores:
        isolated: 15
        moderate: 50
        broad: 85
      enabled_extractors:
        - js_ts
        - stylesheet
      thresholds:
        isolatedMax: 2
        moderateMax: 10
`;
    const scoringConfig = loadScoringConfigFromMergeRiskYaml(yamlText);
    expect(scoringConfig.criteria.blast_radius?.weight).toBe(20);
    expect(scoringConfig.criteria.blast_radius?.options).toEqual({
      aggregation: "max",
      characterization_scores: {
        isolated: 15,
        moderate: 50,
        broad: 85,
      },
      enabled_extractors: ["js_ts", "stylesheet"],
      thresholds: {
        isolatedMax: 2,
        moderateMax: 10,
      },
    });
  });

  it("accepts blast_radius with empty options object", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  blast_radius:
    weight: 1
    options: {}
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).not.toThrow();
  });

  it("accepts blast_radius with no options key", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  blast_radius:
    weight: 1
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).not.toThrow();
  });

  it("throws when blast_radius.options has an unknown property", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  blast_radius:
    weight: 1
    options:
      unknown_flag: true
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when blast_radius.options.characterization_scores has score above 100", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  blast_radius:
    weight: 1
    options:
      characterization_scores:
        broad: 101
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when blast_radius.options.characterization_scores has unknown tier", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  blast_radius:
    weight: 1
    options:
      characterization_scores:
        wide: 90
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when blast_radius.options.aggregation is not max", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  blast_radius:
    weight: 1
    options:
      aggregation: sum
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when blast_radius.options.enabled_extractors is empty", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  blast_radius:
    weight: 1
    options:
      enabled_extractors: []
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when blast_radius.options.enabled_extractors entry is empty string", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  blast_radius:
    weight: 1
    options:
      enabled_extractors: [""]
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when blast_radius.options.thresholds has an unknown property", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  blast_radius:
    weight: 1
    options:
      thresholds:
        isolated_max: 2
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("accepts junior_author mutator with valid options", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  diff_size:
    weight: 100
mutators:
  junior_author:
    options:
      logins:
        - "alice"
        - "bob"
      multiplier: 1.25
`;
    const scoringConfig = loadScoringConfigFromMergeRiskYaml(yamlText);
    expect(scoringConfig.mutators?.junior_author?.options).toEqual({
      logins: ["alice", "bob"],
      multiplier: 1.25,
    });
  });

  it("throws when junior_author is present but options is omitted", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  diff_size:
    weight: 100
mutators:
  junior_author:
    enabled: false
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when junior_author.options has an unknown property", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  diff_size:
    weight: 100
mutators:
  junior_author:
    options:
      logins: ["alice"]
      multiplier: 1.5
      extra: true
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when junior_author.options.multiplier is 1", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  diff_size:
    weight: 100
mutators:
  junior_author:
    options:
      logins: ["alice"]
      multiplier: 1
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when junior_author.options.logins is empty", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  diff_size:
    weight: 100
mutators:
  junior_author:
    options:
      logins: []
      multiplier: 1.5
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when junior_author.options.logins entry is empty string", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  diff_size:
    weight: 100
mutators:
  junior_author:
    options:
      logins: [""]
      multiplier: 1.5
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("accepts junior_author with enabled false when options are present", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
criteria:
  diff_size:
    weight: 100
mutators:
  junior_author:
    enabled: false
    options:
      logins: ["alice"]
      multiplier: 1.5
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).not.toThrow();
  });

  it("accepts critical_service mutator with valid options and root services", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
services:
  payments:
    globs:
      - "src/payments/**"
criteria:
  diff_size:
    weight: 100
mutators:
  critical_service:
    options:
      service_ids:
        - "payments"
      multiplier: 1.2
`;
    const scoringConfig = loadScoringConfigFromMergeRiskYaml(yamlText);
    expect(scoringConfig.mutators?.critical_service?.options).toEqual({
      service_ids: ["payments"],
      multiplier: 1.2,
    });
  });

  it("throws when critical_service is present but options is omitted", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
services:
  api:
    globs:
      - "src/**"
criteria:
  diff_size:
    weight: 100
mutators:
  critical_service:
    enabled: false
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when critical_service.options has an unknown property", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
services:
  api:
    globs:
      - "src/**"
criteria:
  diff_size:
    weight: 100
mutators:
  critical_service:
    options:
      service_ids: ["api"]
      multiplier: 1.5
      extra: true
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when critical_service.options.multiplier is 1", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
services:
  api:
    globs:
      - "src/**"
criteria:
  diff_size:
    weight: 100
mutators:
  critical_service:
    options:
      service_ids: ["api"]
      multiplier: 1
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when critical_service.options.service_ids is empty", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
services:
  api:
    globs:
      - "src/**"
criteria:
  diff_size:
    weight: 100
mutators:
  critical_service:
    options:
      service_ids: []
      multiplier: 1.5
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("throws when critical_service.options.service_ids entry is empty string", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
services:
  api:
    globs:
      - "src/**"
criteria:
  diff_size:
    weight: 100
mutators:
  critical_service:
    options:
      service_ids: [""]
      multiplier: 1.5
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(MergeRiskConfigError);
  });

  it("accepts critical_service with enabled false when options are present", () => {
    const yamlText = `
thresholds:
  low: 0
  medium: 50
services:
  api:
    globs:
      - "src/**"
criteria:
  diff_size:
    weight: 100
mutators:
  critical_service:
    enabled: false
    options:
      service_ids: ["api"]
      multiplier: 1.5
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).not.toThrow();
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

describe("declarative_rules in merge-risk YAML", () => {
  const baseWithDiffSize = `
thresholds:
  low: 30
  medium: 60
criteria:
  diff_size:
    weight: 100
    options:
      max_lines_for_cap: 200
`;

  it("accepts declarative_rules with labels_any and score", () => {
    const yamlText = `
${baseWithDiffSize}
declarative_rules:
  label_risk:
    weight: 10
    options:
      labels_any:
        - database
        - security
      score: 40
`;
    const scoringConfig = loadScoringConfigFromMergeRiskYaml(yamlText);
    expect(scoringConfig.declarative_rules?.label_risk?.weight).toBe(10);
    expect(scoringConfig.declarative_rules?.label_risk?.options).toEqual({
      labels_any: ["database", "security"],
      score: 40,
    });
  });

  it("throws when declarative rule omits weight", () => {
    const yamlText = `
${baseWithDiffSize}
declarative_rules:
  bad:
    options:
      labels_any: [x]
      score: 1
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(/config failed schema validation/i);
  });

  it("throws when declarative score is above 100", () => {
    const yamlText = `
${baseWithDiffSize}
declarative_rules:
  bad:
    weight: 1
    options:
      labels_any: [a]
      score: 101
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(/config failed schema validation/i);
  });

  it("throws when declarative_rules entry has unknown top-level key", () => {
    const yamlText = `
${baseWithDiffSize}
declarative_rules:
  bad:
    weight: 1
    extra_key: true
    options:
      labels_any: [a]
      score: 1
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(/config failed schema validation/i);
  });
});

describe("trusted_plugins in merge-risk YAML", () => {
  const baseWithDiffSize = `
thresholds:
  low: 30
  medium: 60
criteria:
  diff_size:
    weight: 100
    options:
      max_lines_for_cap: 200
`;

  it("accepts trusted_plugins with directory and paths", () => {
    const yamlText = `
${baseWithDiffSize}
trusted_plugins:
  directory: ".merge-risk-plugins"
  paths:
    - ".merge-risk-plugins/a.yaml"
    - ".merge-risk-plugins/b.yaml"
`;
    const scoringConfig = loadScoringConfigFromMergeRiskYaml(yamlText);
    expect(scoringConfig.trusted_plugins?.directory).toBe(".merge-risk-plugins");
    expect(scoringConfig.trusted_plugins?.paths).toEqual([
      ".merge-risk-plugins/a.yaml",
      ".merge-risk-plugins/b.yaml",
    ]);
  });

  it("accepts trusted_plugins with an empty paths array", () => {
    const yamlText = `
${baseWithDiffSize}
trusted_plugins:
  directory: ".merge-risk-plugins"
  paths: []
`;
    const scoringConfig = loadScoringConfigFromMergeRiskYaml(yamlText);
    expect(scoringConfig.trusted_plugins?.paths).toEqual([]);
  });

  it("throws when trusted_plugins omits directory", () => {
    const yamlText = `
${baseWithDiffSize}
trusted_plugins:
  paths:
    - ".merge-risk-plugins/a.yaml"
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(/config failed schema validation/i);
  });

  it("throws when trusted_plugins omits paths", () => {
    const yamlText = `
${baseWithDiffSize}
trusted_plugins:
  directory: ".merge-risk-plugins"
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(/config failed schema validation/i);
  });

  it("throws when trusted_plugins has an unknown top-level key", () => {
    const yamlText = `
${baseWithDiffSize}
trusted_plugins:
  directory: ".merge-risk-plugins"
  paths: []
  extra: true
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(/config failed schema validation/i);
  });

  it("throws when paths contains a non-string entry", () => {
    const yamlText = `
${baseWithDiffSize}
trusted_plugins:
  directory: ".merge-risk-plugins"
  paths:
    - 1
`;
    expect(() => loadScoringConfigFromMergeRiskYaml(yamlText)).toThrow(/config failed schema validation/i);
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

describe("repo .merge-risk.yml dogfood", () => {
  it("loads with schema validation and score() includes service_criticality", () => {
    const repositoryRootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
    const yamlText = readFileSync(join(repositoryRootDirectory, ".merge-risk.yml"), "utf8");
    const scoringConfig = loadScoringConfigFromMergeRiskYaml(yamlText);
    expect(scoringConfig.services?.github_action_extension?.globs?.[0]).toBe("extensions/github-action/**");
    expect(scoringConfig.criteria.service_criticality?.weight).toBe(6);
    expect(scoringConfig.mutators?.junior_author?.options).toMatchObject({
      logins: ["dependabot[bot]", "github-actions[bot]"],
      multiplier: 1.06,
    });
    expect(scoringConfig.mutators?.critical_service?.options).toMatchObject({
      service_ids: ["merge_risk_schema", "github_action_extension"],
      multiplier: 1.05,
    });
    expect(scoringConfig.declarative_rules?.dogfood_declarative_label?.weight).toBe(2);
    expect(scoringConfig.declarative_rules?.dogfood_declarative_label?.options).toMatchObject({
      labels_any: ["merge-risk-dogfood-declarative"],
      score: 18,
    });
    expect(scoringConfig.trusted_plugins?.directory).toBe(".merge-risk-plugins");
    expect(scoringConfig.trusted_plugins?.paths).toEqual([".merge-risk-plugins/dogfood-labels.yaml"]);
    const trustedPluginsConfig = scoringConfig.trusted_plugins;
    if (trustedPluginsConfig === undefined) {
      throw new Error("expected repo .merge-risk.yml to define trusted_plugins");
    }

    const trustedPluginsPathValidation = validateTrustedPluginsPathsStayUnderDirectory(
      trustedPluginsConfig,
    );
    expect(trustedPluginsPathValidation.ok).toBe(true);
    if (!trustedPluginsPathValidation.ok) {
      throw new Error(trustedPluginsPathValidation.message);
    }
    const pluginBodies = new Map<string, string>();
    for (const normalizedPath of trustedPluginsPathValidation.normalizedPluginPaths) {
      pluginBodies.set(
        normalizedPath,
        readFileSync(join(repositoryRootDirectory, normalizedPath), "utf8"),
      );
    }
    const trustedPluginsLoad = loadTrustedPlugins({
      trustedPlugins: trustedPluginsConfig,
      pluginFileContentsByNormalizedPath: pluginBodies,
    });
    expect(trustedPluginsLoad.ok).toBe(true);
    if (!trustedPluginsLoad.ok) {
      throw new Error(trustedPluginsLoad.message);
    }
    const trustedPluginsArtifacts: TrustedPluginsScoringArtifacts = {
      criteria: trustedPluginsLoad.criteria,
      criterionConfigurations: trustedPluginsLoad.criterionConfigurations,
    };

    const context: PRContext = {
      repoSlug: "usebrindle/brindle",
      changeNumber: 1,
      headSha: "abc",
      baseRef: "main",
      author: "dev",
      title: "Test",
      body: "",
      labels: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      files: [{ path: "schema/merge-risk-config.schema.json", status: "modified", additions: 1, deletions: 0 }],
      totalAdditions: 1,
      totalDeletions: 0,
    };
    const scoreResult = score(context, scoringConfig, trustedPluginsArtifacts);
    const criterionNames = scoreResult.breakdown.map((row) => row.name);
    expect(criterionNames).toContain("Service criticality");
    expect(criterionNames).toContain("Declarative rule: dogfood_declarative_label");
    expect(criterionNames).toContain("Trusted plugin: .merge-risk-plugins/dogfood-labels.yaml");
    expect(scoreResult.mutatorsApplied).toContain("critical_service");

    const labeledContext: PRContext = {
      ...context,
      labels: ["merge-risk-dogfood-declarative"],
    };
    const labeledScore = score(labeledContext, scoringConfig, trustedPluginsArtifacts);
    const declarativeRow = labeledScore.breakdown.find(
      (row) => row.name === "Declarative rule: dogfood_declarative_label",
    );
    expect(declarativeRow?.score).toBe(18);

    const trustedPluginLabeledContext: PRContext = {
      ...context,
      labels: ["merge-risk-dogfood-trusted-plugin"],
    };
    const trustedPluginLabeledScore = score(trustedPluginLabeledContext, scoringConfig, trustedPluginsArtifacts);
    const trustedPluginRow = trustedPluginLabeledScore.breakdown.find(
      (row) => row.name === "Trusted plugin: .merge-risk-plugins/dogfood-labels.yaml",
    );
    expect(trustedPluginRow?.score).toBe(18);

    const botContext: PRContext = { ...context, author: "dependabot[bot]" };
    const botScore = score(botContext, scoringConfig, trustedPluginsArtifacts);
    expect(botScore.mutatorsApplied).toEqual(["critical_service", "junior_author"]);
  });
});
