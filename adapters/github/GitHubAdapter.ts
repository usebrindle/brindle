/**
 * GitHub implementation of {@link PlatformAdapter}: hydrates {@link PRContext} from the REST API.
 *
 * @see docs/adrs/0001-no-pr-head-execution.md
 * @see docs/adrs/0002-native-auto-merge.md
 * @see docs/adrs/0007-platform-adapter-boundary.md
 */
import { GraphqlResponseError } from "@octokit/graphql";

import { IstanbulCoverageParseError, parseIstanbulCoverageJson } from "../../core/coverage/istanbul.js";
import type { AutoMergeOutcome, MergeMethod, PRContext, RiskReport } from "../../core/types.js";
import type { PlatformAdapter } from "../PlatformAdapter.js";

import type { GitHubAdapterDependencies } from "./githubAdapter.types.js";
import { mapGitHubPullAndFilesToPRContext } from "./mapGitHubPullToPrContext.js";

const mapGithubNativeAutoMergeFailureToOutcome = (cause: unknown): AutoMergeOutcome => {
  if (cause instanceof GraphqlResponseError) {
    return "setting_off";
  }
  if (cause instanceof Error) {
    const lowered = cause.message.toLowerCase();
    if (lowered.includes("403") || lowered.includes("401")) {
      return "setting_off";
    }
  }
  throw cause;
};

export class GitHubAdapter implements PlatformAdapter {
  private readonly githubAdapterDependencies: GitHubAdapterDependencies;

  /** Set in {@link GitHubAdapter.buildContext} for {@link GitHubAdapter.writeResult} (check run `head_sha`). */
  private lastPullRequestHeadSha: string | undefined;

  /** Set in {@link GitHubAdapter.buildContext} for {@link GitHubAdapter.enableAutoMerge} (GraphQL `pullRequestId`). */
  private lastPullRequestNodeId: string | undefined;

  constructor(githubAdapterDependencies: GitHubAdapterDependencies) {
    this.githubAdapterDependencies = githubAdapterDependencies;
    this.lastPullRequestHeadSha = undefined;
    this.lastPullRequestNodeId = undefined;
  }

  async buildContext(): Promise<PRContext> {
    const pullRequestLookup = {
      repositoryOwner: this.githubAdapterDependencies.repositoryOwner,
      repositoryName: this.githubAdapterDependencies.repositoryName,
      pullRequestNumber: this.githubAdapterDependencies.pullRequestNumber,
    };
    const { githubApiClient } = this.githubAdapterDependencies;
    const pullSnapshot = await githubApiClient.getPullRequest(pullRequestLookup);
    this.lastPullRequestHeadSha = pullSnapshot.headSha;
    this.lastPullRequestNodeId = pullSnapshot.pullRequestNodeId;
    const fileSnapshots = await githubApiClient.listPullRequestFiles(pullRequestLookup);

    const hydration = this.githubAdapterDependencies.istanbulCoverageHydration;
    let coverageReport: PRContext["coverage"];
    if (
      hydration?.shouldHydrate === true &&
      hydration.repositoryRelativePath.trim() !== ""
    ) {
      const rawCoverageJson = await githubApiClient.getRepositoryFileTextAtRef({
        repositoryOwner: pullRequestLookup.repositoryOwner,
        repositoryName: pullRequestLookup.repositoryName,
        path: hydration.repositoryRelativePath.trim(),
        ref: pullSnapshot.headSha,
      });
      if (rawCoverageJson !== null && rawCoverageJson.trim() !== "") {
        try {
          coverageReport = parseIstanbulCoverageJson(rawCoverageJson);
        } catch (cause: unknown) {
          if (!(cause instanceof IstanbulCoverageParseError)) {
            throw cause;
          }
        }
      }
    }

    return mapGitHubPullAndFilesToPRContext(
      pullRequestLookup.repositoryOwner,
      pullRequestLookup.repositoryName,
      pullRequestLookup.pullRequestNumber,
      pullSnapshot,
      fileSnapshots,
      coverageReport,
    );
  }

  async writeResult(report: RiskReport): Promise<void> {
    const headSha = this.lastPullRequestHeadSha;
    if (headSha === undefined) {
      throw new Error(
        "GitHubAdapter.writeResult requires buildContext() first so the PR head SHA is available for the check run.",
      );
    }
    const { githubApiClient, repositoryOwner, repositoryName, pullRequestNumber } =
      this.githubAdapterDependencies;
    const checkName = this.githubAdapterDependencies.mergeRiskCheckRunName ?? "Merge risk";
    await githubApiClient.createMergeRiskCheckRun({
      repositoryOwner,
      repositoryName,
      headSha,
      name: checkName,
      conclusion: report.checkConclusion,
      summaryMarkdown: report.commentMarkdown,
    });
    const shouldPostComment = this.githubAdapterDependencies.postRiskSummaryComment !== false;
    const commentBody = report.commentMarkdown.trim();
    if (shouldPostComment && commentBody.length > 0) {
      await githubApiClient.createPullRequestComment({
        repositoryOwner,
        repositoryName,
        pullRequestNumber,
        body: report.commentMarkdown,
      });
    }
  }

  async enableAutoMerge(method: MergeMethod): Promise<AutoMergeOutcome> {
    const pullRequestNodeId = this.lastPullRequestNodeId;
    if (pullRequestNodeId === undefined || pullRequestNodeId === "") {
      throw new Error(
        "GitHubAdapter.enableAutoMerge requires buildContext() first and a non-empty pull request node_id from GitHub.",
      );
    }
    const { githubApiClient, repositoryOwner, repositoryName, pullRequestNumber } =
      this.githubAdapterDependencies;
    try {
      await githubApiClient.enableNativePullRequestAutoMerge({
        repositoryOwner,
        repositoryName,
        pullRequestNumber,
        pullRequestNodeId,
        mergeMethod: method,
      });
      return "enabled";
    } catch (cause: unknown) {
      return mapGithubNativeAutoMergeFailureToOutcome(cause);
    }
  }
}
