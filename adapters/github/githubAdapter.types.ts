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

/**
 * Minimal GitHub read API for building {@link import("../core/types.js").PRContext}.
 */
export type GitHubApiClient = {
  getPullRequest(lookup: GitHubPullRequestLookup): Promise<GitHubPullSnapshot>;
  listPullRequestFiles(lookup: GitHubPullRequestLookup): Promise<GitHubPullFileSnapshot[]>;
};

/**
 * Construction inputs for {@link GitHubAdapter}.
 */
export type GitHubAdapterDependencies = {
  githubApiClient: GitHubApiClient;
  repositoryOwner: string;
  repositoryName: string;
  pullRequestNumber: number;
};
