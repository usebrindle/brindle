/**
 * Merge forward edges from all extractors into a reverse-dependency map.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import type { DependencyEdge, ReverseDependencyGraph } from "./types.js";

/**
 * Build a reverse map: each target path maps to the set of direct importers.
 * Duplicate edges from the same importer to the same target are deduplicated.
 *
 * @param edges - Forward edges from one or more extractors.
 * @returns One-hop reverse graph for blast-radius upward walks.
 */
export const buildReverseDependencyGraph = (
  edges: readonly DependencyEdge[],
): ReverseDependencyGraph => {
  const importerSetsByTarget = new Map<string, Set<string>>();

  for (const edge of edges) {
    let importersForTarget = importerSetsByTarget.get(edge.to);
    if (!importersForTarget) {
      importersForTarget = new Set();
      importerSetsByTarget.set(edge.to, importersForTarget);
    }
    importersForTarget.add(edge.from);
  }

  const reverseGraph = new Map<string, readonly string[]>();
  for (const [targetPath, importerSet] of importerSetsByTarget) {
    reverseGraph.set(targetPath, [...importerSet]);
  }

  return reverseGraph;
};
