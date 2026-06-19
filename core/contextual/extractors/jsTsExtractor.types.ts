/**
 * Resolution hints for the js_ts dependency extractor (hydrated once per graph build).
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */

/** Keys on {@link import("./types.js").ExtractorContext.resolutionConfig} for js_ts. */
export const JS_TS_RESOLUTION_CONFIG_KEYS = {
  tsconfigPaths: "tsconfigPaths",
  baseUrl: "baseUrl",
} as const;

/** Root tsconfig/jsconfig `paths` and `baseUrl` used for alias resolution. */
export interface JsTsResolutionConfig {
  /** Repo-relative baseUrl from compilerOptions.baseUrl. */
  baseUrl?: string;
  /** compilerOptions.paths mapping (pattern → candidate paths). */
  tsconfigPaths?: Readonly<Record<string, readonly string[]>>;
}

/** Extensions tried when a specifier omits a file extension. */
export const JS_TS_MODULE_EXTENSIONS = [
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
] as const;

/** Stylesheet extensions the js_ts extractor may resolve when imported from JS/TS. */
export const JS_TS_STYLE_EXTENSIONS = [".css", ".scss", ".sass"] as const;
