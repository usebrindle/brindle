/**
 * Contract for the subset of GitHub REST used by {@link GitHubAdapter}.
 * Tests supply a mock; production uses {@link createOctokitGithubApiClient}.
 *
 * @see docs/adrs/0007-platform-adapter-boundary.md
 */

import type { MergeMethod } from "../../core/types.js";

/** Neutral snapshot of a pull request returned by {@link GitHubApiClient.getPullRequest}. */
export type GitHubPullSnapshot = {
  /** GitHub global node ID for GraphQL (e.g. `enablePullRequestAutoMerge`). */
  pullRequestNodeId: string;
  headSha: string;
  baseRefName: string;
  authorLogin: string;
  title: string;
  body: string;
  labelNames: string[];
  createdAtIso: string;
};

/** One file row from {@link GitHubApiClient.listPullRequestFiles}. */
export type GitHubPullFileSnapshot = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
};

export type GitHubPullRequestLookup = {
  repositoryOwner: string;
  repositoryName: string;
  pullRequestNumber: number;
};

/** Read a single text file at an arbitrary ref (used for Istanbul coverage on the PR head; not used for merge-risk config). */
export type GetRepositoryFileTextAtRefInput = {
  repositoryOwner: string;
  repositoryName: string;
  /** Repository-root-relative path (e.g. `coverage/coverage-final.json`). */
  path: string;
  /** Git ref (commit SHA, branch, or tag) passed to the Contents API. */
  ref: string;
};

/** Input for {@link GitHubApiClient.createMergeRiskCheckRun} (maps to `rest.checks.create`). */
export type CreateMergeRiskCheckRunInput = {
  repositoryOwner: string;
  repositoryName: string;
  headSha: string;
  /** Check name shown in the GitHub UI (e.g. "Merge risk"). */
  name: string;
  /** GitHub check conclusion; aligned with {@link import("../../core/types.js").RiskReport.checkConclusion}. */
  conclusion: "success" | "neutral" | "action_required" | "failure";
  /** Markdown summary for `output.summary` (truncated client-side to GitHub limits). */
  summaryMarkdown: string;
};

/** Input for {@link GitHubApiClient.createPullRequestComment} (PRs use the issues comments API). */
export type CreatePullRequestCommentInput = {
  repositoryOwner: string;
  repositoryName: string;
  pullRequestNumber: number;
  body: string;
};

/** Input for {@link GitHubApiClient.enableNativePullRequestAutoMerge} (GraphQL `enablePullRequestAutoMerge`). */
export type EnableNativePullRequestAutoMergeInput = {
  repositoryOwner: string;
  repositoryName: string;
  pullRequestNumber: number;
  pullRequestNodeId: string;
  mergeMethod: MergeMethod;
};

/**
 * Minimal GitHub REST surface for {@link import("./GitHubAdapter.js").GitHubAdapter}: context reads plus publishing merge-risk results.
 */
export type GitHubApiClient = {
  getPullRequest(lookup: GitHubPullRequestLookup): Promise<GitHubPullSnapshot>;
  listPullRequestFiles(lookup: GitHubPullRequestLookup): Promise<GitHubPullFileSnapshot[]>;
  /**
   * Reads a UTF-8 file via Contents API. Returns `null` when the path is missing (404).
   * Callers use this for CI artifacts such as Istanbul coverage (ADR 0005), not for `.merge-risk.yml` on the base ref.
   */
  getRepositoryFileTextAtRef(input: GetRepositoryFileTextAtRefInput): Promise<string | null>;
  createMergeRiskCheckRun(input: CreateMergeRiskCheckRunInput): Promise<void>;
  createPullRequestComment(input: CreatePullRequestCommentInput): Promise<void>;
  enableNativePullRequestAutoMerge(input: EnableNativePullRequestAutoMergeInput): Promise<void>;
};

/**
 * Construction inputs for {@link GitHubAdapter}.
 */
export type GitHubAdapterDependencies = {
  githubApiClient: GitHubApiClient;
  repositoryOwner: string;
  repositoryName: string;
  pullRequestNumber: number;
  /**
   * When not `false`, {@link GitHubAdapter.writeResult} posts {@link import("../../core/types.js").RiskReport.commentMarkdown} as a PR comment when non-empty after trim.
   * Omitted defaults to posting.
   */
  postRiskSummaryComment?: boolean;
  /** Display name for the GitHub Check Run; defaults to `"Merge risk"`. */
  mergeRiskCheckRunName?: string;
  /**
   * When `shouldHydrate` is true, {@link GitHubAdapter.buildContext} fetches `repositoryRelativePath`
   * at the pull request **head** ref and parses Istanbul `coverage-final`-style JSON into `PRContext.coverage`.
   * Omitted or `shouldHydrate: false` skips the Contents API call (ADR 0005: parse artifacts only when the criterion is in play).
   */
  istanbulCoverageHydration?: {
    repositoryRelativePath: string;
    shouldHydrate: boolean;
  };
};
