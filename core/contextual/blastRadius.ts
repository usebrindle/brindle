/**
 * Pure blast-radius analyzer over a unified reverse dependency graph.
 *
 * @see docs/designs/lld-blast-radius-criterion.md
 */
import type { BlastRadiusCharacterization, BlastRadiusFinding } from "./contextual.types.js";
import type { BlastRadiusInput, BlastRadiusThresholds } from "./blastRadius.types.js";
import type { ReverseDependencyGraph } from "./extractors/types.js";

const DEFAULT_ISOLATED_MAX = 2;
const DEFAULT_MODERATE_MAX = 10;

const resolveThresholds = (
  thresholds?: Partial<BlastRadiusThresholds>,
): BlastRadiusThresholds => ({
  isolatedMax: thresholds?.isolatedMax ?? DEFAULT_ISOLATED_MAX,
  moderateMax: thresholds?.moderateMax ?? DEFAULT_MODERATE_MAX,
});

/**
 * Count one-hop importers of a changed file in the reverse graph.
 *
 * @param changedFile - Path whose direct dependents are counted.
 * @param graph - Reverse map from target to direct importers.
 * @returns Direct dependent count and sorted importer paths.
 */
export const countDirectImportersForFile = (
  changedFile: string,
  graph: ReverseDependencyGraph,
): { dependentCount: number; dependents: readonly string[] } => {
  const dependents = [...(graph.get(changedFile) ?? [])].sort((left, right) =>
    left.localeCompare(right),
  );
  return { dependentCount: dependents.length, dependents };
};

/**
 * Count unique transitive importers upward in the reverse graph, excluding the changed file.
 *
 * Cycle-safe BFS; each ancestor is counted at most once.
 *
 * @param changedFile - Path whose upstream reach is measured.
 * @param graph - Reverse map from target to direct importers.
 * @returns Unique ancestor count (primary characterization signal).
 */
export const countTransitiveReachForFile = (
  changedFile: string,
  graph: ReverseDependencyGraph,
): { transitiveReachCount: number } => {
  const visitedAncestors = new Set<string>();
  const pendingImporters = [...(graph.get(changedFile) ?? [])];

  while (pendingImporters.length > 0) {
    const importer = pendingImporters.shift();
    if (!importer || importer === changedFile || visitedAncestors.has(importer)) {
      continue;
    }

    visitedAncestors.add(importer);

    for (const nextImporter of graph.get(importer) ?? []) {
      if (nextImporter !== changedFile && !visitedAncestors.has(nextImporter)) {
        pendingImporters.push(nextImporter);
      }
    }
  }

  return { transitiveReachCount: visitedAncestors.size };
};

/**
 * Map transitive reach to an isolated, moderate, or broad tier.
 *
 * @param transitiveReachCount - Unique ancestor count from {@link countTransitiveReachForFile}.
 * @param thresholds - Optional cut points; defaults isolated ≤2, moderate ≤10.
 * @returns Blast-radius characterization tier.
 */
export const characterizeBlastRadius = (
  transitiveReachCount: number,
  thresholds?: BlastRadiusThresholds,
): BlastRadiusCharacterization => {
  const resolvedThresholds = resolveThresholds(thresholds);

  if (transitiveReachCount <= resolvedThresholds.isolatedMax) {
    return "isolated";
  }
  if (transitiveReachCount <= resolvedThresholds.moderateMax) {
    return "moderate";
  }
  return "broad";
};

const analyzeChangedFile = (
  changedFile: string,
  graph: ReverseDependencyGraph,
  thresholds: BlastRadiusThresholds,
): BlastRadiusFinding => {
  const { dependentCount, dependents } = countDirectImportersForFile(changedFile, graph);
  const { transitiveReachCount } = countTransitiveReachForFile(changedFile, graph);
  const characterization = characterizeBlastRadius(transitiveReachCount, thresholds);

  return {
    changedFile,
    directDependentCount: dependentCount,
    directDependents: dependents,
    transitiveReachCount,
    characterization,
  };
};

/**
 * Produce per-file blast-radius findings for changed paths over a reverse graph.
 *
 * Language-blind: callers supply a unified graph from enabled extractors.
 *
 * @param input - Changed paths, reverse graph, and optional reach thresholds.
 * @returns One finding per changed file in input order.
 */
export const analyzeBlastRadius = (input: BlastRadiusInput): BlastRadiusFinding[] => {
  const thresholds = resolveThresholds(input.thresholds);

  return input.changedFiles.map((changedFile) =>
    analyzeChangedFile(changedFile, input.graph, thresholds),
  );
};
