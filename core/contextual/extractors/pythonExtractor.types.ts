/**
 * Resolution hints for the python dependency extractor (hydrated once per graph build).
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */

/** Keys on {@link import("./types.js").ExtractorContext.resolutionConfig} for python. */
export const PYTHON_RESOLUTION_CONFIG_KEYS = {
  packageRoots: "packageRoots",
} as const;

/** Package roots used to resolve absolute import module paths to repo-relative files. */
export interface PythonResolutionConfig {
  /** Repo-relative directories searched for absolute imports (defaults to `["."]`). */
  packageRoots: readonly string[];
}
