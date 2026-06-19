/**
 * JavaScript/TypeScript static import and require extractor (v1).
 *
 * Stub until US-005 implements parsing per extractors LLD.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import type { DependencyEdge, DependencyExtractor, ExtractorContext } from "./types.js";

const JS_TS_EXTENSIONS = [
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
] as const;

const extractNoEdges = (): readonly DependencyEdge[] => [];

const resolveNoSpecifier = (
  _fromFile: string,
  _specifier: string,
  _context: ExtractorContext,
): null => null;

/** v1 JS/TS extractor; edge extraction implemented in US-005. */
export const jsTsExtractor: DependencyExtractor = {
  id: "js_ts",
  fileExtensions: JS_TS_EXTENSIONS,
  extractEdges: extractNoEdges,
  resolveSpecifier: resolveNoSpecifier,
};
