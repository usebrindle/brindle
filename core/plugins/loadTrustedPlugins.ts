/**
 * Resolves base-branch trusted plugin **files** into {@link Criterion} implementations plus matching
 * {@link CriterionConfiguration} entries (weight from the file). No network I/O; callers supply file text.
 *
 * @see docs/adrs/0001-no-pr-head-execution.md
 * @see docs/designs/lld-merge-risk-classifier.md
 */
import * as yaml from "js-yaml";

import { evaluateLabelsAnyCriterionResult } from "../rules/declarativeRule.js";
import type { Criterion, CriterionConfiguration, CriterionResult, PRContext, TrustedPluginsConfiguration } from "../types.js";
import { validateTrustedPluginsPathsStayUnderDirectory } from "./trustedPluginPaths.js";

/** Prefix for internal criterion ids so trusted plugins never collide with `criteria` or `declarative:` keys. */
export const TRUSTED_PLUGIN_CRITERION_ID_PREFIX = "plugin:" as const;

/**
 * @param normalizedPluginPath - Path after {@link validateTrustedPluginsPathsStayUnderDirectory} normalization.
 * @returns Internal criterion id for the scorer pipeline (slice 3 wiring).
 */
export const trustedPluginCriterionId = (normalizedPluginPath: string): string =>
  `${TRUSTED_PLUGIN_CRITERION_ID_PREFIX}${normalizedPluginPath}`;

export type TrustedPluginsLoadOutcome =
  | {
      ok: true;
      criteria: Record<string, Criterion>;
      criterionConfigurations: Record<string, CriterionConfiguration>;
    }
  | { ok: false; message: string };

type TrustedPluginYamlParseResult = { ok: true; value: unknown } | { ok: false; message: string };

type WeightParseResult = { ok: true; weight: number } | { ok: false; message: string };

type LabelsAnyOptionsPayload = { labels_any?: unknown; score?: unknown };

type LabelsAnyPluginParseResult =
  | { ok: true; weight: number; labelsAnyOptions: LabelsAnyOptionsPayload }
  | { ok: false; message: string };

const parseTrustedPluginYamlToUnknown = (
  yamlText: string,
  normalizedPluginPath: string,
): TrustedPluginYamlParseResult => {
  try {
    return { ok: true, value: yaml.load(yamlText, { schema: yaml.CORE_SCHEMA }) };
  } catch (cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return {
      ok: false,
      message: `Invalid YAML in trusted plugin ${JSON.stringify(normalizedPluginPath)}: ${detail}.`,
    };
  }
};

const readPositiveFiniteWeight = (record: Record<string, unknown>, normalizedPluginPath: string): WeightParseResult => {
  const rawWeight = record.weight;
  if (typeof rawWeight !== "number" || !Number.isFinite(rawWeight) || rawWeight <= 0) {
    return {
      ok: false,
      message: `Trusted plugin ${JSON.stringify(normalizedPluginPath)} must set a finite weight > 0.`,
    };
  }
  return { ok: true, weight: rawWeight };
};

const labelsAnyOptionsFromPluginRecord = (record: Record<string, unknown>): LabelsAnyOptionsPayload => ({
  labels_any: record.labels_any,
  score: record.score,
});

const parseLabelsAnyPluginDocument = (parsedRoot: unknown, normalizedPluginPath: string): LabelsAnyPluginParseResult => {
  if (parsedRoot === null || parsedRoot === undefined || typeof parsedRoot !== "object" || Array.isArray(parsedRoot)) {
    return {
      ok: false,
      message: `Trusted plugin ${JSON.stringify(normalizedPluginPath)} must be a YAML mapping at the root.`,
    };
  }
  const record = parsedRoot as Record<string, unknown>;
  const rawKind = record.kind;
  if (rawKind !== "labels_any") {
    return {
      ok: false,
      message: `Trusted plugin ${JSON.stringify(normalizedPluginPath)} has unsupported or missing kind (expected "labels_any").`,
    };
  }
  const weightOutcome = readPositiveFiniteWeight(record, normalizedPluginPath);
  if (!weightOutcome.ok) {
    return weightOutcome;
  }
  return {
    ok: true,
    weight: weightOutcome.weight,
    labelsAnyOptions: labelsAnyOptionsFromPluginRecord(record),
  };
};

const createLabelsAnyTrustedPluginCriterion = (options: {
  normalizedPluginPath: string;
  labelsAnyOptions: LabelsAnyOptionsPayload;
}): Criterion => {
  const { normalizedPluginPath, labelsAnyOptions } = options;
  const frozenOptions: unknown = { ...labelsAnyOptions };
  return {
    name: `Trusted plugin: ${normalizedPluginPath}`,
    evaluate: (context: PRContext, _configOptions: unknown): CriterionResult =>
      evaluateLabelsAnyCriterionResult(context, frozenOptions),
  };
};

/**
 * Builds criteria and configurations from validated paths and in-memory file bodies (typically fetched
 * at the base ref by an adapter). Returns an error when path validation fails, a file is missing from the map,
 * YAML is invalid, or the document does not match the supported MVP shape.
 *
 * @param trustedPlugins - Optional section from {@link ScoringConfig}; when omitted, returns empty maps.
 * @param pluginFileContentsByNormalizedPath - Keys are normalized paths from validation (see {@link validateTrustedPluginsPathsStayUnderDirectory}).
 */
export const loadTrustedPlugins = (options: {
  trustedPlugins: TrustedPluginsConfiguration | undefined;
  pluginFileContentsByNormalizedPath: ReadonlyMap<string, string>;
}): TrustedPluginsLoadOutcome => {
  const { trustedPlugins, pluginFileContentsByNormalizedPath } = options;
  if (trustedPlugins === undefined) {
    return { ok: true, criteria: {}, criterionConfigurations: {} };
  }

  const pathValidation = validateTrustedPluginsPathsStayUnderDirectory(trustedPlugins);
  if (!pathValidation.ok) {
    return pathValidation;
  }

  const sortedNormalizedPaths = [...pathValidation.normalizedPluginPaths].sort((leftPath, rightPath) =>
    leftPath.localeCompare(rightPath),
  );

  const criteria: Record<string, Criterion> = {};
  const criterionConfigurations: Record<string, CriterionConfiguration> = {};

  for (const normalizedPluginPath of sortedNormalizedPaths) {
    const yamlText = pluginFileContentsByNormalizedPath.get(normalizedPluginPath);
    if (yamlText === undefined) {
      return {
        ok: false,
        message: `Missing trusted plugin file body for path ${JSON.stringify(normalizedPluginPath)}.`,
      };
    }

    const yamlParseOutcome = parseTrustedPluginYamlToUnknown(yamlText, normalizedPluginPath);
    if (!yamlParseOutcome.ok) {
      return yamlParseOutcome;
    }

    const documentOutcome = parseLabelsAnyPluginDocument(yamlParseOutcome.value, normalizedPluginPath);
    if (!documentOutcome.ok) {
      return documentOutcome;
    }

    const criterionId = trustedPluginCriterionId(normalizedPluginPath);
    criteria[criterionId] = createLabelsAnyTrustedPluginCriterion({
      normalizedPluginPath,
      labelsAnyOptions: documentOutcome.labelsAnyOptions,
    });
    criterionConfigurations[criterionId] = {
      weight: documentOutcome.weight,
    };
  }

  return { ok: true, criteria, criterionConfigurations };
};
