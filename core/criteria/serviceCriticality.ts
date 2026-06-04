/**
 * Built-in `service_criticality` criterion (runtime only). Options types live in {@link ./serviceCriticality.types.js}.
 *
 * Root `services` are merged onto evaluate options by {@link ../scorer.js} (ADR 0009); validated YAML never embeds
 * `services` under `criteria.service_criticality.options`.
 *
 * @see docs/adrs/0009-service-criticality-criterion-config.md
 * @see docs/designs/lld-merge-risk-classifier.md
 */
import micromatch from "micromatch";

import type { Criterion, CriterionResult, PRContext } from "../types.js";

import type {
  ServiceCatalogEntry,
  ServiceCriticalityEvaluateInput,
  ServicesCatalog,
} from "./serviceCriticality.types.js";

const micromatchOptions = { dot: true } as const;

const clampScoreValue = (value: number): number => Math.min(100, Math.max(0, value));

const changedPathsFromContext = (context: PRContext): string[] =>
  context.files.map((changedFile) => changedFile.path);

const asPlainObject = (value: unknown): Record<string, unknown> | undefined => {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const sanitizeScoresMap = (raw: unknown): Record<string, number> => {
  const record = asPlainObject(raw);
  if (record === undefined) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(record).flatMap(([serviceId, rawScore]) => {
      if (typeof rawScore !== "number" || !Number.isFinite(rawScore)) {
        return [];
      }
      return [[serviceId, clampScoreValue(rawScore)] as const];
    }),
  );
};

const parseEvaluateInput = (options: unknown): ServiceCriticalityEvaluateInput => {
  const record = asPlainObject(options);
  if (record === undefined) {
    return {};
  }
  const input: ServiceCriticalityEvaluateInput = {};
  if (record.aggregation === "max") {
    input.aggregation = "max";
  }
  if (record.scores !== undefined) {
    input.scores = sanitizeScoresMap(record.scores);
  }
  if (typeof record.default_score === "number" && Number.isFinite(record.default_score)) {
    input.default_score = clampScoreValue(record.default_score);
  }
  const servicesRaw = record.services;
  if (servicesRaw !== undefined && typeof servicesRaw === "object" && !Array.isArray(servicesRaw)) {
    input.services = servicesRaw as ServicesCatalog;
  }
  return input;
};

const pathMatchesGlob = (pathValue: string, globPattern: string): boolean =>
  micromatch.isMatch(pathValue, globPattern, micromatchOptions);

const trimmedGlobPatternsFromEntry = (entry: ServiceCatalogEntry | undefined): string[] => {
  if (entry === undefined || !Array.isArray(entry.globs)) {
    return [];
  }
  return entry.globs
    .filter((globPattern): globPattern is string => typeof globPattern === "string" && globPattern.trim() !== "")
    .map((globPattern) => globPattern.trim());
};

const anyChangedPathMatchesAnyGlob = (changedPaths: string[], globPatterns: string[]): boolean =>
  changedPaths.some((pathValue) => globPatterns.some((globPattern) => pathMatchesGlob(pathValue, globPattern)));

const sortedServiceIdsTouchingPaths = (changedPaths: string[], catalog: ServicesCatalog): string[] =>
  Object.keys(catalog)
    .sort((leftId, rightId) => leftId.localeCompare(rightId))
    .filter((serviceId) => {
      const globPatterns = trimmedGlobPatternsFromEntry(catalog[serviceId]);
      return globPatterns.length > 0 && anyChangedPathMatchesAnyGlob(changedPaths, globPatterns);
    });

/** Human-oriented catalog line for Notes (ids + globs). */
const formatConfiguredServicesForNotes = (catalog: ServicesCatalog): string =>
  Object.keys(catalog)
    .sort((a, b) => a.localeCompare(b))
    .map((serviceId) => {
      const globs = trimmedGlobPatternsFromEntry(catalog[serviceId]);
      const globPart = globs.length > 0 ? globs.join(", ") : "(no globs)";
      return `${serviceId} (${globPart})`;
    })
    .join("; ");

const pathTouchesService = (pathValue: string, serviceId: string, catalog: ServicesCatalog): boolean => {
  const globPatterns = trimmedGlobPatternsFromEntry(catalog[serviceId]);
  return globPatterns.length > 0 && anyChangedPathMatchesAnyGlob([pathValue], globPatterns);
};

/** Up to `maxPaths` changed paths that fall under at least one touched service (sorted, unique). */
const examplePathsForTouchedServices = (
  changedPaths: string[],
  catalog: ServicesCatalog,
  touchedServiceIds: string[],
  maxPaths: number,
): string[] => {
  const matched = changedPaths.filter((pathValue) =>
    touchedServiceIds.some((serviceId) => pathTouchesService(pathValue, serviceId, catalog)),
  );
  const uniqueSorted = [...new Set(matched)].sort((a, b) => a.localeCompare(b));
  return uniqueSorted.slice(0, maxPaths);
};

const formatExamplePathsForNotes = (
  changedPaths: string[],
  catalog: ServicesCatalog,
  touchedServiceIds: string[],
): string => {
  const maxShow = 4;
  const examples = examplePathsForTouchedServices(changedPaths, catalog, touchedServiceIds, maxShow + 1);
  if (examples.length === 0) {
    return "";
  }
  const overflow = examples.length > maxShow;
  const head = overflow ? examples.slice(0, maxShow) : examples;
  const listed = head.map((pathValue) => `\`${pathValue}\``).join(", ");
  const more = overflow ? ` (+${examples.length - maxShow} more)` : "";
  return ` Example changed paths: ${listed}${more}.`;
};

const configuredScoreForServiceOrZero = (
  scoresByServiceId: Record<string, number>,
  serviceId: string,
): number => {
  const configured = scoresByServiceId[serviceId];
  if (typeof configured !== "number" || !Number.isFinite(configured)) {
    return 0;
  }
  return configured;
};

const maxConfiguredScoreAcrossServices = (
  touchedServiceIds: string[],
  scoresByServiceId: Record<string, number>,
): number => {
  if (touchedServiceIds.length === 0) {
    return 0;
  }
  const perServiceScores = touchedServiceIds.map((serviceId) =>
    configuredScoreForServiceOrZero(scoresByServiceId, serviceId),
  );
  return clampScoreValue(Math.max(...perServiceScores));
};

const defaultScoreFromInput = (input: ServiceCriticalityEvaluateInput): number =>
  clampScoreValue(
    typeof input.default_score === "number" && Number.isFinite(input.default_score) ? input.default_score : 0,
  );

const detailNoServiceMatch = (): Record<string, unknown> => ({
  touchedServiceIds: [] as string[],
  matchedServices: false,
});

/** Default-path outcomes: score is the configured default; no services matched. */
const criterionResultDefaultOnly = (score: number, justification: string): CriterionResult => ({
  score,
  justification,
  detail: detailNoServiceMatch(),
});

const perTouchedServiceConfiguredPhrase = (
  serviceId: string,
  scoresByServiceId: Record<string, number>,
): string => {
  const configured = configuredScoreForServiceOrZero(scoresByServiceId, serviceId);
  return `${serviceId} (configured ${configured})`;
};

const justificationForMatchedServices = (
  touchedServiceIds: string[],
  rawScore: number,
  scoresByServiceId: Record<string, number>,
  changedPaths: string[],
  catalog: ServicesCatalog,
): string => {
  const parts = touchedServiceIds.map((id) => perTouchedServiceConfiguredPhrase(id, scoresByServiceId));
  const servicesPart = parts.join("; ");
  const examplesPart = formatExamplePathsForNotes(changedPaths, catalog, touchedServiceIds);
  return `Matched service(s): ${servicesPart}; using max raw score ${rawScore}.${examplesPart}`;
};

const criterionResultForMatchedServices = (
  touchedServiceIds: string[],
  rawScore: number,
  scoresByServiceId: Record<string, number>,
  changedPaths: string[],
  catalog: ServicesCatalog,
): CriterionResult => ({
  score: rawScore,
  justification: justificationForMatchedServices(
    touchedServiceIds,
    rawScore,
    scoresByServiceId,
    changedPaths,
    catalog,
  ),
  detail: {
    touchedServiceIds,
    matchedServices: true,
    aggregation: "max",
    examplePaths: examplePathsForTouchedServices(changedPaths, catalog, touchedServiceIds, 12),
  },
});

const evaluateServiceCriticality = (context: PRContext, options: unknown): CriterionResult => {
  const input = parseEvaluateInput(options);
  const changedPaths = changedPathsFromContext(context);
  const defaultRaw = defaultScoreFromInput(input);

  const catalog = input.services;
  const catalogSummary =
    catalog !== undefined && Object.keys(catalog).length > 0 ? formatConfiguredServicesForNotes(catalog) : "";

  if (changedPaths.length === 0) {
    const catalogHint = catalogSummary ? ` Configured services: ${catalogSummary}.` : "";
    return criterionResultDefaultOnly(
      defaultRaw,
      `No changed files; using default service criticality score (${defaultRaw}).${catalogHint}`,
    );
  }

  if (catalog === undefined || Object.keys(catalog).length === 0) {
    return criterionResultDefaultOnly(defaultRaw, "No services catalog configured; using default service criticality score.");
  }

  const touchedServiceIds = sortedServiceIdsTouchingPaths(changedPaths, catalog);
  if (touchedServiceIds.length === 0) {
    return criterionResultDefaultOnly(
      defaultRaw,
      `No changed paths matched any configured service. Services in config: ${catalogSummary}. Using default score (${defaultRaw}).`,
    );
  }

  const scoresByServiceId = input.scores ?? {};
  const rawScore = maxConfiguredScoreAcrossServices(touchedServiceIds, scoresByServiceId);
  return criterionResultForMatchedServices(
    touchedServiceIds,
    rawScore,
    scoresByServiceId,
    changedPaths,
    catalog,
  );
};

/**
 * Criterion for YAML key `service_criticality` (registered in {@link ./builtins.js}).
 */
export const serviceCriticalityCriterion: Criterion = {
  name: "Service criticality",
  /**
   * @param context - Uses {@link PRContext.files} paths; ignores other fields.
   * @param options - `criteria.service_criticality.options` plus optional runtime `services` merge (see module doc).
   * @returns Raw score 0–100: max per touched service when `aggregation` is `max` (MVP default).
   */
  evaluate: evaluateServiceCriticality,
};
