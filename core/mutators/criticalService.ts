/**
 * Built-in `critical_service` mutator: multiplies the running score when the change touches configured logical services.
 *
 * Root `services` globs are merged into options by the scorer (ADR 0009); this module stays pure over {@link PRContext}.
 *
 * @see docs/adrs/0009-service-criticality-criterion-config.md
 * @see docs/designs/lld-merge-risk-classifier.md
 */
import type { ServicesCatalog } from "../criteria/serviceCriticality.types.js";
import { sortedServiceIdsTouchingChangedPaths } from "../serviceCatalog/globMatchForServices.js";
import type { PRContext } from "../types.js";

import { createConditionalMultiplierMutator } from "./mutatorPrimitives.js";

const changedPathsFromContext = (context: PRContext): string[] =>
  context.files.map((changedFile) => changedFile.path);

const asPlainObject = (value: unknown): Record<string, unknown> | undefined => {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const servicesCatalogFromMergedOptions = (options: unknown): ServicesCatalog | undefined => {
  const record = asPlainObject(options);
  if (record === undefined) {
    return undefined;
  }
  const servicesRaw = record.services;
  if (servicesRaw === undefined || typeof servicesRaw !== "object" || Array.isArray(servicesRaw)) {
    return undefined;
  }
  return servicesRaw as ServicesCatalog;
};

/**
 * @param options - `mutators.critical_service.options` plus runtime `services` merge from the scorer.
 */
const criticalServiceIdsFromOptions = (options: unknown): string[] => {
  const record = asPlainObject(options);
  if (record === undefined) {
    return [];
  }
  const raw = record.service_ids as unknown;
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      continue;
    }
    const trimmed = item.trim();
    if (trimmed === "") {
      continue;
    }
    out.push(trimmed);
  }
  return out;
};

const criticalServiceApplies = (context: PRContext, options: unknown): boolean => {
  const catalog = servicesCatalogFromMergedOptions(options);
  if (catalog === undefined || Object.keys(catalog).length === 0) {
    return false;
  }
  const changedPaths = changedPathsFromContext(context);
  if (changedPaths.length === 0) {
    return false;
  }
  const configuredIds = criticalServiceIdsFromOptions(options);
  if (configuredIds.length === 0) {
    return false;
  }
  const touched = new Set(sortedServiceIdsTouchingChangedPaths(changedPaths, catalog));
  return configuredIds.some((serviceId) => touched.has(serviceId));
};

/**
 * Registered under YAML id `critical_service`. Multiplies when any **`service_ids`** entry matches a touched service.
 */
export const criticalServiceMutator = createConditionalMultiplierMutator({
  name: "Critical service",
  applies: criticalServiceApplies,
});
