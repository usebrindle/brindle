/**
 * Parse `.merge-risk.yml` (or equivalent) into a {@link ScoringConfig} using JSON Schema validation.
 * Callers pass YAML text loaded from the **base branch** (see ADR 0001); this module performs no I/O.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 */
import { Ajv, type ErrorObject } from "ajv";
import * as yaml from "js-yaml";

import type { ScoringConfig } from "./types.js";

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
  if (!validateParsedMergeRiskConfig(rootMapping)) {
    throw new MergeRiskConfigError(
      `Config failed schema validation: ${formatAjvErrors(validateParsedMergeRiskConfig.errors)}`,
    );
  }
  return rootMapping as unknown as ScoringConfig;
};

/**
 * Parses YAML and returns a {@link ScoringConfig} ready for {@link score}.
 *
 * @param mergeRiskYamlText - Full `.merge-risk.yml` (or fragment) text from the base branch.
 * @returns Validated scoring configuration.
 */
export const loadScoringConfigFromMergeRiskYaml = (mergeRiskYamlText: string): ScoringConfig => {
  const parsedDocument = parseMergeRiskYamlDocument(mergeRiskYamlText);
  return assertValidScoringConfig(parsedDocument);
};
