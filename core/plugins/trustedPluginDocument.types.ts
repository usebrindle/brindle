/**
 * Trusted plugin **file** shapes (YAML on the base branch). Interpreted only by fixed handlers in
 * {@link ./loadTrustedPlugins.js}; never executed as code (ADR 0001).
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 */

/**
 * Supported `kind` values for MVP trusted plugin documents.
 *
 * Additional kinds may be added later with new handlers; unknown `kind` is a load error.
 */
export type TrustedPluginDocumentKind = "labels_any";

/**
 * `labels_any` plugin file: same signal shape as declarative `options`, plus a top-level {@link weight}
 * because plugin files are not entries under `criteria` in `.merge-risk.yml`.
 */
export interface TrustedPluginLabelsAnyDocument {
  kind: "labels_any";
  /** Positive weight in the shared scorer pool (same semantics as `criteria.<id>.weight`). */
  weight: number;
  labels_any?: string[];
  score?: number;
}
