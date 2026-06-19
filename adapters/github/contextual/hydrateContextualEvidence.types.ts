/**
 * Input and result types for unified contextual evidence hydration.
 *
 * @see docs/designs/lld-contextual-evidence-overview.md
 * @see docs/adrs/0010-contextual-analysis-at-head.md
 */
import type { ContextualEvidenceSnapshot } from "../../../core/contextual/contextual.types.js";
import type { BlastRadiusThresholds } from "../../../core/contextual/blastRadius.types.js";
import type { ExtractorRegistry } from "../../../core/contextual/extractors/registry.js";

import type { HydrateDependencyGraphDependencies } from "./hydrateDependencyGraph.types.js";
import type { HydrateFamiliarityPrContextDependencies } from "./hydrateFamiliarityPrContext.types.js";

/** Injectable git and filesystem dependencies for tests. */
export interface HydrateContextualEvidenceDependencies
  extends HydrateFamiliarityPrContextDependencies,
    Partial<HydrateDependencyGraphDependencies> {}

/** Options from `criteria.author_familiarity` used during hydration only. */
export interface HydrateContextualAuthorFamiliarityOptions {
  historyWindowDays?: number;
  authorEmails?: readonly string[];
}

/** Options from `criteria.blast_radius` used during hydration only. */
export interface HydrateContextualBlastRadiusOptions {
  enabledExtractors?: readonly string[];
  thresholds?: Partial<BlastRadiusThresholds>;
}

/** Arguments for gated contextual hydration at the adapter edge. */
export interface HydrateContextualEvidenceInput {
  /** Absolute path to the checked-out git repository. */
  repositoryRoot: string;
  /** PR base ref (branch name or SHA). */
  baseRef: string;
  /** PR head ref (branch name or SHA). */
  headRef: string;
  /** GitHub login from {@link PRContext.author}. */
  authorLogin: string;
  /** Changed file paths from the pull request file list. */
  changedPaths: readonly string[];
  /** Reference time from {@link PRContext.classifiedAtIso}. */
  classifiedAt: Date;
  /** When true, runs merge-base git history/blame and familiarity analysis. */
  hydrateAuthorFamiliarity: boolean;
  /** When true, runs dependency graph walk and blast-radius analysis. */
  hydrateBlastRadius: boolean;
  authorFamiliarityOptions?: HydrateContextualAuthorFamiliarityOptions;
  blastRadiusOptions?: HydrateContextualBlastRadiusOptions;
  /** Extractor registry; defaults to v1 built-ins when omitted. */
  extractorRegistry?: ExtractorRegistry;
  dependencies?: HydrateContextualEvidenceDependencies;
}

/** Hydrated contextual fields merged onto {@link PRContext}. */
export interface HydrateContextualEvidenceResult {
  contextualEvidence: ContextualEvidenceSnapshot;
  baseRevision?: string;
  authorEmails?: readonly string[];
}
