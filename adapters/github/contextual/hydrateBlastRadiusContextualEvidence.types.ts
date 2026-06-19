/**
 * Input and result types for blast-radius contextual evidence hydration.
 *
 * @see docs/designs/lld-blast-radius-criterion.md
 */
import type {
  BlastRadiusFinding,
  NotAnalyzedForBlastRadius,
} from "../../../core/contextual/contextual.types.js";
import type { BlastRadiusThresholds } from "../../../core/contextual/blastRadius.types.js";
import type { ExtractorRegistry } from "../../../core/contextual/extractors/registry.js";

import type { HydrateDependencyGraphDependencies } from "./hydrateDependencyGraph.types.js";

/** Arguments for graph hydration plus blast-radius analysis on changed paths. */
export interface HydrateBlastRadiusContextualEvidenceInput {
  /** Absolute path to the checked-out git repository. */
  repoRoot: string;
  /** Changed file paths from the pull request file list. */
  changedFiles: readonly string[];
  /** Subset of registry ids to run (defaults to v1 when omitted at config layer). */
  enabledExtractorIds: readonly string[];
  registry: ExtractorRegistry;
  /** Optional reach thresholds from `criteria.blast_radius.options.thresholds`. */
  thresholds?: Partial<BlastRadiusThresholds>;
  dependencies?: Partial<HydrateDependencyGraphDependencies>;
}

/** Blast-radius slice of {@link PRContext.contextualEvidence}. */
export interface HydrateBlastRadiusContextualEvidenceResult {
  blastRadiusFindings: readonly BlastRadiusFinding[];
  notAnalyzedForBlastRadius: readonly NotAnalyzedForBlastRadius[];
  limitations: readonly string[];
  enabledExtractors: readonly string[];
}
