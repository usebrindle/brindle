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
  evaluate(context: PRContext, options: unknown): CriterionResult;
}

export interface CriterionResult {
  score: number;
  justification: string;
  detail?: Record<string, unknown>;
}

export interface CriterionBreakdown {
  name: string;
  score: number;
  weight: number;
  weighted: number;
  justification: string;
  detail?: Record<string, unknown>;
}

export interface ScoreResult {
  score: number;
  tier: "LOW" | "MEDIUM" | "HIGH";
  breakdown: CriterionBreakdown[];
  mutatorsApplied: string[];
  disabledCriteria: string[];
}

export interface RiskReport {
  result: ScoreResult;
  commentMarkdown: string;
  checkConclusion: "success" | "neutral" | "action_required" | "failure";
  autoMergeOutcome: AutoMergeOutcome;
}
