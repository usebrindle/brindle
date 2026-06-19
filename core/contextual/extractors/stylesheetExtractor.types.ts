/**
 * Resolution hints and scan types for the stylesheet dependency extractor.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import type { DependencyEdgeKind } from "./types.js";

/** Keys on {@link import("./types.js").ExtractorContext.resolutionConfig} shared with js_ts. */
export const STYLESHEET_RESOLUTION_CONFIG_KEYS = {
  tsconfigPaths: "tsconfigPaths",
  baseUrl: "baseUrl",
} as const;

/** Root tsconfig/jsconfig paths/baseUrl for aliased stylesheet imports. */
export interface StylesheetResolutionConfig {
  baseUrl?: string;
  tsconfigPaths?: Readonly<Record<string, readonly string[]>>;
}

/** Extensions registered on the stylesheet extractor. */
export const STYLESHEET_FILE_EXTENSIONS = [".css", ".scss", ".sass"] as const;

/** Extension preference when resolving extensionless stylesheet specifiers. */
export const STYLESHEET_RESOLUTION_EXTENSIONS = [".scss", ".sass", ".css"] as const;

/** A static stylesheet reference before path resolution. */
export interface StylesheetReference {
  specifier: string;
  kind: Extract<DependencyEdgeKind, "stylesheet_import" | "stylesheet_use" | "stylesheet_forward">;
}
