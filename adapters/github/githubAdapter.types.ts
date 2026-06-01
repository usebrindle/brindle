/**
 * Contract for the subset of GitHub REST used by {@link GitHubAdapter}.
 * Tests supply a mock; production uses {@link createOctokitGithubApiClient}.
 *
 * @see docs/adrs/0007-platform-adapter-boundary.md
 */

/** Neutral snapshot of a pull request returned by {@link GitHubApiClient.getPullRequest}. */
export type GitHubPullSnapshot = {
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

/**
 * Minimal GitHub REST surface for {@link import("./GitHubAdapter.js").GitHubAdapter}: context reads plus publishing merge-risk results.
 */
export type GitHubApiClient = {
  getPullRequest(lookup: GitHubPullRequestLookup): Promise<GitHubPullSnapshot>;
  listPullRequestFiles(lookup: GitHubPullRequestLookup): Promise<GitHubPullFileSnapshot[]>;
  createMergeRiskCheckRun(input: CreateMergeRiskCheckRunInput): Promise<void>;
  createPullRequestComment(input: CreatePullRequestCommentInput): Promise<void>;
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
};
