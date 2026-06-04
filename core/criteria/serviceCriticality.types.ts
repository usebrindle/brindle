/**
 * Types for the optional top-level `services` catalog and the `service_criticality` criterion options.
 *
 * Runtime evaluation lives in {@link ./serviceCriticality.js}. At scoring time {@link ../scorer.js} may merge root
 * `services` onto the options object passed to `Criterion.evaluate` (see `core/types.ts`).
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
 * An empty object is valid (same ergonomics as `file_patterns`). Meaningful risk signal needs a root `services` catalog plus `scores` (and optional `aggregation: max`).
 */
export type ServiceCriticalityCriterionOptions = {
  aggregation?: ServiceCriticalityAggregation;
  scores?: Record<string, number>;
  default_score?: number;
};

/**
 * Input to {@link ./serviceCriticality.js} at evaluate time: validated YAML options plus optional **`services`**
 * merged from root `ScoringConfig.services` by the scorer (not present in on-disk YAML under `options`).
 */
export type ServiceCriticalityEvaluateInput = ServiceCriticalityCriterionOptions & {
  services?: ServicesCatalog;
};
