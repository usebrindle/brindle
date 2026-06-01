export type { PlatformAdapter } from "./PlatformAdapter.js";
export { GitHubAdapter } from "./github/GitHubAdapter.js";
export { createOctokitGithubApiClient } from "./github/octokitGithubApiClient.js";
export { mapGitHubPullAndFilesToPRContext } from "./github/mapGitHubPullToPrContext.js";
export type {
  CreateMergeRiskCheckRunInput,
  CreatePullRequestCommentInput,
  EnableNativePullRequestAutoMergeInput,
  GitHubAdapterDependencies,
  GitHubApiClient,
  GitHubPullFileSnapshot,
  GitHubPullRequestLookup,
  GitHubPullSnapshot,
} from "./github/githubAdapter.types.js";
