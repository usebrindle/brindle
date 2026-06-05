/**
 * Platform-neutral shapes for the merge-risk classifier.
 * @see docs/designs/lld-merge-risk-classifier.md
 */

import type { ServicesCatalog } from "./criteria/serviceCriticality.types.js";

/**
 * How the platform merges the PR when auto-merge runs (metadata for adapters; not used by the scorer yet).
 */
export type MergeMethod = "squash" | "merge" | "rebase";

/**
 * Outcome of attempting native auto-merge (core decision; adapter performs platform API calls).
 *
 * @see docs/adrs/0002-native-auto-merge.md
 */
export type AutoMergeOutcome =
  | "skipped"
  | "not_eligible"
  /**
   * Core-only: tier qualifies under policy and the adapter should attempt native auto-merge.
   * The adapter replaces this with `enabled` or `setting_off` after the platform call (ADR 0002).
   */
  | "eligible"
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

/**
 * Parsed coverage summary attached during context build (see coverage adapters under `core/coverage/`).
 *
 * For Istanbul `coverage-final.json`, `linesCovered` / `linesTotal` are **statement** hit counts
 * from the per-file `s` map (neutral names reused for simplicity).
 */
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
  /**
   * ISO-8601 instant when the adapter finished hydrating this context (runner wall clock).
   * Used with {@link headCommitCommittedAtIso} for pure temporal criteria (e.g. head commit age); criteria must not call `Date.now()` (ADR 0004).
   */
  classifiedAtIso?: string;
  /**
   * ISO-8601 **committer** timestamp for {@link headSha} from the platform commit API, when available.
   * Omitted when the commit lookup fails or the response has no usable date.
   */
  headCommitCommittedAtIso?: string;
}

export interface Criterion {
  /** Human-readable label used in score breakdown output. */
  name: string;
  /**
   * Optional gate run before {@link Criterion.evaluate}. Omitted means always try to score.
   *
   * @param context - Hydrated change data (no I/O).
   * @param options - Criterion-specific options from `criteria.<id>.options` in config.
   * @returns `false` to exclude this criterion and redistribute its weight; `true` to run {@link Criterion.evaluate}.
   */
  isEnabled?(context: PRContext, options: unknown): boolean;
  /**
   * Pure scoring step: must not perform I/O or read clocks.
   *
   * @param context - Full {@link PRContext} built by an adapter.
   * @param options - Criterion-specific options from config (validated when loaded via {@link loadScoringConfigFromMergeRiskYaml} / schema; still `unknown` inside the scorer until wired through).
   * @returns Raw score 0–100 (higher = riskier for this signal), justification, and optional detail.
   */
  evaluate(context: PRContext, options: unknown): CriterionResult;
}

export interface CriterionResult {
  /** Raw criterion output 0–100 before weighting; higher means riskier for this signal. */
  score: number;
  /** Short human-readable explanation shown in breakdown output. */
  justification: string;
  /** Optional structured detail for UIs or logs. */
  detail?: Record<string, unknown>;
  /** When true, this criterion is dropped and its weight is redistributed. */
  selfDisable?: boolean;
}

/** Per-criterion entry under `criteria` in merge-risk config. */
export interface CriterionConfiguration {
  /** When `false`, this criterion is skipped entirely. */
  enabled?: boolean;
  /** Relative weight before normalization across active criteria. */
  weight: number;
  /** Criterion-specific options; shape depends on criterion id (see sibling `*.types.ts` per criterion). */
  options?: unknown;
}

export interface MutatorConfiguration {
  /** When `false`, this mutator is skipped. */
  enabled?: boolean;
  /** Mutator-specific options from config. */
  options?: unknown;
}

/**
 * Minimal config consumed by the scorer. Load from YAML with {@link ./config.js}; schema lives under `schema/`.
 * @see docs/designs/lld-merge-risk-classifier.md
 */
export interface ScoringConfig {
  thresholds: { low: number; medium: number };
  criteria: Record<string, CriterionConfiguration>;
  mutators?: Record<string, MutatorConfiguration>;
  /**
   * Optional declarative rules (base-branch YAML only; ADR 0001). Each key is a rule id; internal scorer ids are
   * prefixed `declarative:` so they never collide with {@link criteria} keys.
   *
   * @see docs/designs/lld-merge-risk-classifier.md
   */
  declarative_rules?: Record<string, CriterionConfiguration>;
  /**
   * Optional catalog of logical services (repo-relative globs). Consumed by `service_criticality` (ADR 0009).
   * Present only when declared in base-branch `.merge-risk.yml`.
   */
  services?: ServicesCatalog;
}

/**
 * Native auto-merge policy from optional `auto_merge` in `.merge-risk.yml` (ADR 0002).
 * Omitted or disabled in YAML means the workflow does not call `PlatformAdapter.enableAutoMerge`.
 */
export interface MergeRiskAutoMergeConfig {
  enabled: true;
  /** Inclusive upper bound: tiers at or below this qualify for `eligible` in {@link import("./report.js").buildRiskReport}. */
  maxEligibleTier: "LOW" | "MEDIUM" | "HIGH";
  /** Passed to GitHub's `enablePullRequestAutoMerge` mutation. */
  method: MergeMethod;
}

/** Multiplies the running score after weighted criteria sum; return `null` to skip. */
export interface Mutator {
  /** Display name for logs (mutator id comes from config keys). */
  name: string;
  /**
   * @param context - Hydrated change data.
   * @param options - Mutator-specific options from `mutators.<id>.options`.
   * @returns Strictly positive multiplier, or `null` if this mutator does not apply.
   */
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
  /** Full scoring outcome and audit fields. */
  result: ScoreResult;
  /** Markdown body for an optional platform comment. */
  commentMarkdown: string;
  /** Maps tier and policy to a platform check conclusion. */
  checkConclusion: "success" | "neutral" | "action_required" | "failure";
  /** What happened when attempting native auto-merge (decision in core; execution in adapter). */
  autoMergeOutcome: AutoMergeOutcome;
}
