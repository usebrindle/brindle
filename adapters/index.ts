export type { PlatformAdapter } from "./PlatformAdapter.js";
export { createGitBlameSource } from "./github/contextual/createGitBlameSource.js";
export { createGitHistorySource } from "./github/contextual/createGitHistorySource.js";
export { hydrateDependencyGraph } from "./github/contextual/hydrateDependencyGraph.js";
export { hydrateBlastRadiusContextualEvidence } from "./github/contextual/hydrateBlastRadiusContextualEvidence.js";
export { hydrateFamiliarityPrContext } from "./github/contextual/hydrateFamiliarityPrContext.js";
export type {
  HydrateDependencyGraphDependencies,
  HydrateDependencyGraphInput,
  HydrateDependencyGraphResult,
} from "./github/contextual/hydrateDependencyGraph.types.js";
export type {
  HydrateBlastRadiusContextualEvidenceInput,
  HydrateBlastRadiusContextualEvidenceResult,
} from "./github/contextual/hydrateBlastRadiusContextualEvidence.types.js";
export type {
  HydrateFamiliarityPrContextDependencies,
  HydrateFamiliarityPrContextInput,
  HydrateFamiliarityPrContextResult,
} from "./github/contextual/hydrateFamiliarityPrContext.types.js";
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
  PullRequestIssueCommentSnapshot,
  UpdatePullRequestIssueCommentInput,
} from "./github/githubAdapter.types.js";
