/**
 * Pluggable dependency extractors for the unified blast-radius graph.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
export { builtInExtractors, defaultExtractorRegistry } from "./builtins.js";
export { buildReverseDependencyGraph } from "./buildReverseDependencyGraph.js";
export { goExtractor } from "./goExtractor.js";
export { jsTsExtractor } from "./jsTsExtractor.js";
export { pythonExtractor } from "./pythonExtractor.js";
export { rustExtractor } from "./rustExtractor.js";
export {
  createExtractorRegistry,
  DEFAULT_V1_EXTRACTOR_IDS,
} from "./registry.js";
export type { ExtractorRegistry } from "./registry.js";
export { stylesheetExtractor } from "./stylesheetExtractor.js";
export type {
  DependencyEdge,
  DependencyEdgeKind,
  DependencyExtractor,
  ExtractorContext,
  ReverseDependencyGraph,
} from "./types.js";
