/**
 * YAML options shape for MVP declarative rules (labels-only interpreter).
 *
 * Loaded from base-branch config only (ADR 0001). The scorer still treats `options` as `unknown`;
 * this type documents the intended validated shape once JSON Schema covers it (slice 2).
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 */
export interface DeclarativeRuleLabelsAnyOptions {
  /**
   * If **any** of these strings matches a label on the change request (case-insensitive, trimmed),
   * the rule’s raw score is {@link score}; otherwise raw score is 0.
   */
  labels_any?: string[];
  /** Raw risk 0–100 when a configured label matches; higher means riskier. */
  score?: number;
}
