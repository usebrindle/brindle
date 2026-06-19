/**
 * Pluggable dependency extractors for the unified blast-radius graph.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
export { buildReverseDependencyGraph } from "./buildReverseDependencyGraph.js";
export type {
  DependencyEdge,
  DependencyEdgeKind,
  DependencyExtractor,
  ExtractorContext,
  ReverseDependencyGraph,
} from "./types.js";
