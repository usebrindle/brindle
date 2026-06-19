/**
 * Resolution hints for the go dependency extractor (hydrated once per graph build).
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */

/** Keys on {@link import("./types.js").ExtractorContext.resolutionConfig} for go. */
export const GO_RESOLUTION_CONFIG_KEYS = {
  modulePath: "modulePath",
} as const;

/** Root `go.mod` module directive used for internal import resolution. */
export interface GoResolutionConfig {
  /** Module path from the root go.mod `module` directive. */
  modulePath?: string;
}
