/**
 * YAML options for the built-in `critical_service` mutator (`mutators.critical_service.options`).
 *
 * Root `services` are merged onto apply options by {@link ../scorer.js} (ADR 0009), same as `service_criticality`.
 *
 * @see docs/adrs/0009-service-criticality-criterion-config.md
 * @see docs/designs/lld-merge-risk-classifier.md
 */
export type CriticalServiceMutatorOptions = {
  /** Logical service ids (keys under root `services`) that trigger the multiplier when any changed path matches their globs. */
  service_ids: string[];
  /** Strictly multiplicative factor when a listed service is touched (must be > 1). */
  multiplier: number;
};
