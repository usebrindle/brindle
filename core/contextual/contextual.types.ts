/**
 * Shared types for contextual evidence (author familiarity and blast radius).
 *
 * Hydrated on {@link PRContext.contextualEvidence} by adapters; consumed by criteria and report formatters.
 *
 * @see docs/designs/lld-contextual-evidence-overview.md
 * @see docs/designs/lld-author-familiarity-criterion.md
 * @see docs/designs/lld-blast-radius-criterion.md
 */

/** Per-file author-familiarity characterization tier. */
export type ContextualCharacterization = "high" | "moderate" | "none";

/** Per-file blast-radius reach characterization tier. */
export type BlastRadiusCharacterization = "isolated" | "moderate" | "broad";

/** Whether a changed path was added or modified relative to merge-base. */
export type FileChangeKind = "added" | "modified";

/**
 * Per-file familiarity finding at merge-base (pre-PR signals).
 *
 * @see docs/designs/lld-author-familiarity-criterion.md
 */
export interface FamiliarityFinding {
  touchedFile: string;
  changeKind: FileChangeKind;
  authorOwnedLineCount: number;
  totalBlameableLineCount: number;
  shareOfCurrentContent: number;
  authorChangedLineCount: number;
  totalChangedLineCount: number;
  shareOfWindowedLineChurn: number;
  authorCommitCount: number;
  totalFileCommitCount: number;
  lastTouchDate: Date | null;
  shareOfFileCommitChurn: number;
  characterization: ContextualCharacterization;
}

/**
 * Per-file blast-radius finding from the unified reverse dependency graph.
 *
 * @see docs/designs/lld-blast-radius-criterion.md
 */
export interface BlastRadiusFinding {
  changedFile: string;
  directDependentCount: number;
  directDependents: readonly string[];
  transitiveReachCount: number;
  characterization: BlastRadiusCharacterization;
}

/** Changed file skipped for blast-radius analysis with an explicit reason. */
export interface NotAnalyzedForBlastRadius {
  path: string;
  reason: string;
}

/**
 * Hydrated contextual evidence snapshot shared by criteria and report builders.
 *
 * Graph edges are not retained on {@link PRContext} after hydration — findings only.
 */
export interface ContextualEvidenceSnapshot {
  familiarityFindings: readonly FamiliarityFinding[];
  blastRadiusFindings: readonly BlastRadiusFinding[];
  notAnalyzedForBlastRadius: readonly NotAnalyzedForBlastRadius[];
  limitations: readonly string[];
  enabledExtractors: readonly string[];
}
