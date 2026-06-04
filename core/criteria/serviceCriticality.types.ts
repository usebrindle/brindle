/**
 * Types for the optional top-level `services` catalog and the `service_criticality` criterion options.
 *
 * Runtime evaluation lives in {@link ./serviceCriticality.js} (follow-up). This module is contract-only for schema and callers.
 *
 * @see docs/adrs/0009-service-criticality-criterion-config.md
 * @see docs/designs/lld-merge-risk-classifier.md
 */

/**
 * How to combine per-service raw scores when a change touches more than one service (MVP: max only).
 */
export type ServiceCriticalityAggregation = "max";

/**
 * One logical service: repo-relative micromatch globs (see ADR 0009).
 */
export type ServiceCatalogEntry = {
  globs: string[];
};

/**
 * Root-level `services` mapping in `.merge-risk.yml` (service id → path globs).
 */
export type ServicesCatalog = Record<string, ServiceCatalogEntry>;

/**
 * `criteria.service_criticality.options` shape validated by `schema/merge-risk-config.schema.json`.
 *
 * An empty object is valid (same ergonomics as `file_patterns`). Meaningful scores require `aggregation` and `scores` once the criterion is implemented.
 */
export type ServiceCriticalityCriterionOptions = {
  aggregation?: ServiceCriticalityAggregation;
  scores?: Record<string, number>;
  default_score?: number;
};
