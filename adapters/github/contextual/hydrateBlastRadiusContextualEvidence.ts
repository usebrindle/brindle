/**
 * Impure blast-radius hydration: dependency graph walk plus pure analysis.
 *
 * @see docs/designs/lld-blast-radius-criterion.md
 * @see docs/adrs/0010-contextual-analysis-at-head.md
 */
import { analyzeBlastRadius } from "../../../core/contextual/blastRadius.js";
import type { NotAnalyzedForBlastRadius } from "../../../core/contextual/contextual.types.js";
import { normalizeForwardSlashes } from "../../../core/contextual/pathNormalize.js";

import { hydrateDependencyGraph } from "./hydrateDependencyGraph.js";
import type {
  HydrateBlastRadiusContextualEvidenceInput,
  HydrateBlastRadiusContextualEvidenceResult,
} from "./hydrateBlastRadiusContextualEvidence.types.js";

const resolveAnalyzableChangedFiles = (
  changedFiles: readonly string[],
  notAnalyzedForBlastRadius: readonly NotAnalyzedForBlastRadius[],
): readonly string[] => {
  const notAnalyzedPaths = new Set(
    notAnalyzedForBlastRadius.map((entry) => normalizeForwardSlashes(entry.path)),
  );

  return changedFiles
    .map(normalizeForwardSlashes)
    .filter((changedFilePath) => !notAnalyzedPaths.has(changedFilePath));
};

/**
 * Builds the unified reverse graph and produces blast-radius findings for analyzable changed files.
 *
 * Changed paths without an enabled extractor appear in `notAnalyzedForBlastRadius` only.
 * When every changed file is unsupported, `blastRadiusFindings` is empty (criterion self-disables).
 *
 * @param input - Repository root, changed paths, enabled extractors, and optional thresholds.
 * @returns Findings and metadata for {@link PRContext.contextualEvidence}.
 */
export const hydrateBlastRadiusContextualEvidence = (
  input: HydrateBlastRadiusContextualEvidenceInput,
): HydrateBlastRadiusContextualEvidenceResult => {
  const graphHydrationResult = hydrateDependencyGraph({
    repoRoot: input.repoRoot,
    enabledExtractorIds: input.enabledExtractorIds,
    registry: input.registry,
    changedFiles: input.changedFiles,
    dependencies: input.dependencies,
  });

  const analyzableChangedFiles = resolveAnalyzableChangedFiles(
    input.changedFiles,
    graphHydrationResult.notAnalyzedForBlastRadius,
  );

  const blastRadiusFindings = analyzeBlastRadius({
    changedFiles: analyzableChangedFiles,
    graph: graphHydrationResult.graph,
    thresholds: input.thresholds,
  });

  return {
    blastRadiusFindings,
    notAnalyzedForBlastRadius: graphHydrationResult.notAnalyzedForBlastRadius,
    limitations: graphHydrationResult.limitations,
    enabledExtractors: graphHydrationResult.enabledExtractors,
  };
};
