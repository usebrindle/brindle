export type { PlatformAdapter } from "./PlatformAdapter.js";
export { GitHubAdapter } from "./github/GitHubAdapter.js";
export { createOctokitGithubApiClient } from "./github/octokitGithubApiClient.js";
export { mapGitHubPullAndFilesToPRContext } from "./github/mapGitHubPullToPrContext.js";
export type {
  CreateMergeRiskCheckRunInput,
  CreatePullRequestCommentInput,
  EnableNativePullRequestAutoMergeInput,
  GetRepositoryCommitCommittedAtIsoInput,
  GitHubAdapterDependencies,
  GitHubApiClient,
  GitHubPullFileSnapshot,
  GitHubPullRequestLookup,
  GitHubPullSnapshot,
  GitHubTemporalContextHydration,
} from "./github/githubAdapter.types.js";
