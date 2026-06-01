/**
 * Parse `.merge-risk.yml` (or equivalent) into a {@link ScoringConfig} using JSON Schema validation.
 * Callers pass YAML text loaded from the **base branch** (see ADR 0001); this module performs no I/O.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 */
import { Ajv, type ErrorObject } from "ajv";
import * as yaml from "js-yaml";

import type { MergeRiskAutoMergeConfig, MergeMethod, ScoringConfig } from "./types.js";

import mergeRiskConfigSchema from "../schema/merge-risk-config.schema.json" with { type: "json" };

const ajv = new Ajv({ allErrors: true });
const validateParsedMergeRiskConfig = ajv.compile(mergeRiskConfigSchema);

/**
 * Raised when YAML is syntactically invalid, the document is not a mapping, or schema validation fails.
 */
export class MergeRiskConfigError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MergeRiskConfigError";
  }
}

const formatAjvErrors = (errors: ErrorObject[] | null | undefined): string => {
  if (errors === null || errors === undefined || errors.length === 0) {
    return "unknown validation error";
  }
  return errors
    .map((error) => {
      const path = error.instancePath === "" ? "/" : error.instancePath;
      return `${path} ${error.message ?? "invalid"}`.trim();
    })
    .join("; ");
};

/**
 * Parses YAML text into a plain JavaScript value using a restricted schema (no arbitrary YAML tags).
 *
 * @param mergeRiskYamlText - Full file contents, typically from the base ref.
 * @returns Parsed object or array primitive; callers must validate shape.
 */
export const parseMergeRiskYamlDocument = (mergeRiskYamlText: string): unknown => {
  try {
    return yaml.load(mergeRiskYamlText, { schema: yaml.CORE_SCHEMA });
  } catch (cause) {
    throw new MergeRiskConfigError(`Invalid YAML: ${String(cause)}`, { cause });
  }
};

const ensureRootMapping = (parsedDocument: unknown): Record<string, unknown> => {
  if (parsedDocument === null || parsedDocument === undefined) {
    throw new MergeRiskConfigError(
      "Merge risk config is empty: expected a YAML mapping with `thresholds` and `criteria`.",
    );
  }
  if (Array.isArray(parsedDocument)) {
    throw new MergeRiskConfigError("Merge risk config must be a YAML mapping at the root, not an array.");
  }
  if (typeof parsedDocument !== "object") {
    throw new MergeRiskConfigError(
      `Merge risk config must be a YAML mapping at the root, got ${typeof parsedDocument}.`,
    );
  }
  return parsedDocument as Record<string, unknown>;
};

/**
 * Validates an already-parsed value against the merge-risk scoring subset schema.
 *
 * @param parsedDocument - Typically the return value of {@link parseMergeRiskYamlDocument}.
 * @returns Typed {@link ScoringConfig} when validation succeeds.
 */
export const assertValidScoringConfig = (parsedDocument: unknown): ScoringConfig => {
  const rootMapping = ensureRootMapping(parsedDocument);
  return splitValidatedMergeRiskRootMapping(rootMapping).scoringConfig;
};

const mergeRiskTierYamlToScoreTier = (tierRaw: string): "LOW" | "MEDIUM" | "HIGH" => {
  const normalized = tierRaw.trim().toLowerCase();
  if (normalized === "low") return "LOW";
  if (normalized === "medium") return "MEDIUM";
  if (normalized === "high") return "HIGH";
  throw new MergeRiskConfigError(
    `auto_merge.tier must be low, medium, or high (got ${JSON.stringify(tierRaw)}).`,
  );
};

const mergeMethodFromYamlString = (methodRaw: string): MergeMethod => {
  const normalized = methodRaw.trim().toLowerCase();
  if (normalized === "squash" || normalized === "merge" || normalized === "rebase") {
    return normalized;
  }
  throw new MergeRiskConfigError(
    `auto_merge.method must be squash, merge, or rebase (got ${JSON.stringify(methodRaw)}).`,
  );
};

/** Parses optional `auto_merge` from a parsed root mapping (defensive checks for non-object shapes). */
export const parseMergeRiskAutoMergeSection = (
  rootMapping: Record<string, unknown>,
): MergeRiskAutoMergeConfig | undefined => {
  const raw = rootMapping.auto_merge;
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new MergeRiskConfigError("auto_merge must be a YAML mapping when present.");
  }
  const mapping = raw as Record<string, unknown>;
  if (mapping.enabled !== true) {
    return undefined;
  }
  const tierRaw = mapping.tier;
  const methodRaw = mapping.method;
  if (typeof tierRaw !== "string" || typeof methodRaw !== "string") {
    throw new MergeRiskConfigError("When auto_merge.enabled is true, tier and method must be strings.");
  }
  return {
    enabled: true,
    maxEligibleTier: mergeRiskTierYamlToScoreTier(tierRaw),
    method: mergeMethodFromYamlString(methodRaw),
  };
};

const splitValidatedMergeRiskRootMapping = (
  rootMapping: Record<string, unknown>,
): { scoringConfig: ScoringConfig; autoMerge?: MergeRiskAutoMergeConfig } => {
  if (!validateParsedMergeRiskConfig(rootMapping)) {
    throw new MergeRiskConfigError(
      `Config failed schema validation: ${formatAjvErrors(validateParsedMergeRiskConfig.errors)}`,
    );
  }
  const autoMerge = parseMergeRiskAutoMergeSection(rootMapping);
  return {
    scoringConfig: rootMapping as unknown as ScoringConfig,
    autoMerge,
  };
};

/**
 * Parses and validates a full `.merge-risk.yml` document from the base branch: scoring plus optional `auto_merge`.
 *
 * @param mergeRiskYamlText - Full file contents from the base ref (ADR 0001).
 */
export const loadMergeRiskRepositoryYaml = (
  mergeRiskYamlText: string,
): { scoringConfig: ScoringConfig; autoMerge?: MergeRiskAutoMergeConfig } => {
  const parsedDocument = parseMergeRiskYamlDocument(mergeRiskYamlText);
  const rootMapping = ensureRootMapping(parsedDocument);
  return splitValidatedMergeRiskRootMapping(rootMapping);
};

/**
 * Parses YAML and returns a {@link ScoringConfig} ready for {@link score}.
 *
 * @param mergeRiskYamlText - Full `.merge-risk.yml` (or fragment) text from the base branch.
 * @returns Validated scoring configuration.
 */
export const loadScoringConfigFromMergeRiskYaml = (mergeRiskYamlText: string): ScoringConfig =>
  loadMergeRiskRepositoryYaml(mergeRiskYamlText).scoringConfig;
