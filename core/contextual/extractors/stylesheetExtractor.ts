/**
 * CSS/SCSS/Sass stylesheet dependency extractor (v1).
 *
 * Stub until US-006 implements parsing per extractors LLD.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import type { DependencyEdge, DependencyExtractor, ExtractorContext } from "./types.js";

const STYLESHEET_EXTENSIONS = [".css", ".scss", ".sass"] as const;

const extractNoEdges = (): readonly DependencyEdge[] => [];

const resolveNoSpecifier = (
  _fromFile: string,
  _specifier: string,
  _context: ExtractorContext,
): null => null;

/** v1 stylesheet extractor; edge extraction implemented in US-006. */
export const stylesheetExtractor: DependencyExtractor = {
  id: "stylesheet",
  fileExtensions: STYLESHEET_EXTENSIONS,
  extractEdges: extractNoEdges,
  resolveSpecifier: resolveNoSpecifier,
};
