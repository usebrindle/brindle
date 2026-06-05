/**
 * Pure helpers: which logical services (ADR 0009 catalog) match changed repository paths.
 *
 * Shared by `service_criticality` and the `critical_service` mutator so glob rules stay consistent.
 *
 * @see docs/adrs/0009-service-criticality-criterion-config.md
 */
import micromatch from "micromatch";

import type { ServiceCatalogEntry, ServicesCatalog } from "../criteria/serviceCriticality.types.js";

const micromatchOptions = { dot: true } as const;

export const pathMatchesGlob = (pathValue: string, globPattern: string): boolean =>
  micromatch.isMatch(pathValue, globPattern, micromatchOptions);

export const trimmedGlobPatternsFromEntry = (entry: ServiceCatalogEntry | undefined): string[] => {
  if (entry === undefined || !Array.isArray(entry.globs)) {
    return [];
  }
  return entry.globs
    .filter((globPattern): globPattern is string => typeof globPattern === "string" && globPattern.trim() !== "")
    .map((globPattern) => globPattern.trim());
};

export const anyChangedPathMatchesAnyGlob = (changedPaths: string[], globPatterns: string[]): boolean =>
  changedPaths.some((pathValue) => globPatterns.some((globPattern) => pathMatchesGlob(pathValue, globPattern)));

/**
 * Service ids (sorted) whose configured globs match at least one changed path.
 */
export const sortedServiceIdsTouchingChangedPaths = (
  changedPaths: string[],
  catalog: ServicesCatalog,
): string[] =>
  Object.keys(catalog)
    .sort((leftId, rightId) => leftId.localeCompare(rightId))
    .filter((serviceId) => {
      const globPatterns = trimmedGlobPatternsFromEntry(catalog[serviceId]);
      return globPatterns.length > 0 && anyChangedPathMatchesAnyGlob(changedPaths, globPatterns);
    });
