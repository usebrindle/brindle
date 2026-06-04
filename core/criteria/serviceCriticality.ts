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
  const out: Record<string, number> = {};
  for (const [serviceId, rawScore] of Object.entries(record)) {
    if (typeof rawScore !== "number" || !Number.isFinite(rawScore)) {
      continue;
    }
    out[serviceId] = clampScoreValue(rawScore);
  }
  return out;
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

const touchedServiceIdsForPaths = (paths: string[], catalog: ServicesCatalog): string[] => {
  const touched: string[] = [];
  const sortedServiceIds = Object.keys(catalog).sort((leftId, rightId) => leftId.localeCompare(rightId));
  for (const serviceId of sortedServiceIds) {
    const entry = catalog[serviceId];
    if (entry === undefined || !Array.isArray(entry.globs)) {
      continue;
    }
    let matchedThisService = false;
    for (const globPattern of entry.globs) {
      if (typeof globPattern !== "string" || globPattern.trim() === "") {
        continue;
      }
      const trimmedGlob = globPattern.trim();
      if (paths.some((pathValue) => micromatch.isMatch(pathValue, trimmedGlob, micromatchOptions))) {
        matchedThisService = true;
        break;
      }
    }
    if (matchedThisService) {
      touched.push(serviceId);
    }
  }
  return touched;
};

const maxScoreForTouchedServices = (
  touchedServiceIds: string[],
  scoresByServiceId: Record<string, number>,
): number => {
  let highest = 0;
  for (const serviceId of touchedServiceIds) {
    const configured = scoresByServiceId[serviceId];
    const contribution = typeof configured === "number" && Number.isFinite(configured) ? configured : 0;
    if (contribution > highest) {
      highest = contribution;
    }
  }
  return clampScoreValue(highest);
};

/**
 * Criterion for YAML key `service_criticality` (registered in {@link ./builtins.js} in a later slice).
 */
export const serviceCriticalityCriterion: Criterion = {
  name: "Service criticality",
  /**
   * @param context - Uses {@link PRContext.files} paths; ignores other fields.
   * @param options - `criteria.service_criticality.options` plus optional runtime `services` merge (see module doc).
   * @returns Raw score 0–100: max per touched service when `aggregation` is `max` (MVP default).
   */
  evaluate: (context: PRContext, options: unknown): CriterionResult => {
    const input = parseEvaluateInput(options);
    const paths = changedPathsFromContext(context);
    const defaultRaw = clampScoreValue(
      typeof input.default_score === "number" && Number.isFinite(input.default_score) ? input.default_score : 0,
    );

    if (paths.length === 0) {
      return {
        score: defaultRaw,
        justification: "No changed files; using default service criticality score.",
        detail: { touchedServiceIds: [] as string[], matchedServices: false },
      };
    }

    const catalog = input.services;
    if (catalog === undefined || Object.keys(catalog).length === 0) {
      return {
        score: defaultRaw,
        justification: "No services catalog configured; using default service criticality score.",
        detail: { touchedServiceIds: [] as string[], matchedServices: false },
      };
    }

    const touchedServiceIds = touchedServiceIdsForPaths(paths, catalog);
    if (touchedServiceIds.length === 0) {
      return {
        score: defaultRaw,
        justification: "No changed paths matched configured service globs; using default score.",
        detail: { touchedServiceIds: [] as string[], matchedServices: false },
      };
    }

    const scoresByServiceId = input.scores ?? {};
    const rawScore = maxScoreForTouchedServices(touchedServiceIds, scoresByServiceId);
    return {
      score: rawScore,
      justification: `Touches service(s) ${touchedServiceIds.join(", ")} (max configured score ${rawScore}).`,
      detail: {
        touchedServiceIds,
        matchedServices: true,
        aggregation: "max",
      },
    };
  },
};
