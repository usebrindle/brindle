/**
 * Platform-neutral shapes for the merge-risk classifier.
 * @see docs/designs/lld-merge-risk-classifier.md
 */

export type MergeMethod = "squash" | "merge" | "rebase";

export type AutoMergeOutcome =
  | "skipped"
  | "not_eligible"
  | "enabled"
  | "unsupported"
  | "setting_off";

/** One changed path and line stats as seen from the platform. */
export interface ChangedFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

/** Parsed coverage summary attached in context build (formats TBD). */
export interface CoverageReport {
  linesCovered?: number;
  linesTotal?: number;
}

/**
 * Everything the scorer reads: hydrated once by an adapter, then treated as immutable input.
 *
 * @see docs/adrs/0004-pure-criteria-over-hydrated-context.md
 */
export interface PRContext {
  repoSlug: string;
  changeNumber: number;
  headSha: string;
  baseRef: string;
  author: string;
  title: string;
  body: string;
  labels: string[];
  createdAt: string;
  files: ChangedFile[];
  totalAdditions: number;
  totalDeletions: number;
  coverage?: CoverageReport;
  baselineCoverage?: CoverageReport;
}

export interface Criterion {
  name: string;
  /**
   * When false, the criterion is excluded and its weight is redistributed.
   * Omitted means always enabled.
   */
  isEnabled?(context: PRContext, options: unknown): boolean;
  evaluate(context: PRContext, options: unknown): CriterionResult;
}

export interface CriterionResult {
  score: number;
  justification: string;
  detail?: Record<string, unknown>;
  /** When true, this criterion is dropped and its weight is redistributed. */
  selfDisable?: boolean;
}

/** Per-criterion weights and options; ids map to built-in / plugin implementations. */
export interface CriterionConfiguration {
  enabled?: boolean;
  weight: number;
  options?: unknown;
}

export interface MutatorConfiguration {
  enabled?: boolean;
  options?: unknown;
}

/**
 * Minimal config consumed by the scorer. The full merge-risk file is validated in a later slice.
 * @see docs/designs/lld-merge-risk-classifier.md
 */
export interface ScoringConfig {
  thresholds: { low: number; medium: number };
  criteria: Record<string, CriterionConfiguration>;
  mutators?: Record<string, MutatorConfiguration>;
}

/** Multiplies the running score; return null to skip. */
export interface Mutator {
  name: string;
  apply(context: PRContext, options: unknown): number | null;
}

/** One row in the score breakdown table (per criterion after weighting). */
export interface CriterionBreakdown {
  name: string;
  score: number;
  weight: number;
  weighted: number;
  justification: string;
  detail?: Record<string, unknown>;
}

/** Outcome of {@link score}: numeric result, tier, audit trail fields. */
export interface ScoreResult {
  score: number;
  tier: "LOW" | "MEDIUM" | "HIGH";
  breakdown: CriterionBreakdown[];
  mutatorsApplied: string[];
  disabledCriteria: string[];
}

/**
 * Neutral payload adapters render (comments, checks, auto-merge outcome metadata).
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 */
export interface RiskReport {
  result: ScoreResult;
  commentMarkdown: string;
  checkConclusion: "success" | "neutral" | "action_required" | "failure";
  autoMergeOutcome: AutoMergeOutcome;
}
