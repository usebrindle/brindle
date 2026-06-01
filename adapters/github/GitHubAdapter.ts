/**
 * GitHub implementation of {@link PlatformAdapter}: hydrates {@link PRContext} from the REST API.
 *
 * @see docs/adrs/0001-no-pr-head-execution.md
 * @see docs/adrs/0007-platform-adapter-boundary.md
 */
import type { AutoMergeOutcome, MergeMethod, PRContext, RiskReport } from "../../core/types.js";
import type { PlatformAdapter } from "../PlatformAdapter.js";

import type { GitHubAdapterDependencies } from "./githubAdapter.types.js";
import { mapGitHubPullAndFilesToPRContext } from "./mapGitHubPullToPrContext.js";

export class GitHubAdapter implements PlatformAdapter {
  private readonly githubAdapterDependencies: GitHubAdapterDependencies;

  /** Set in {@link GitHubAdapter.buildContext} for {@link GitHubAdapter.writeResult} (check run `head_sha`). */
  private lastPullRequestHeadSha: string | undefined;

  constructor(githubAdapterDependencies: GitHubAdapterDependencies) {
    this.githubAdapterDependencies = githubAdapterDependencies;
    this.lastPullRequestHeadSha = undefined;
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
    const fileSnapshots = await githubApiClient.listPullRequestFiles(pullRequestLookup);
    return mapGitHubPullAndFilesToPRContext(
      pullRequestLookup.repositoryOwner,
      pullRequestLookup.repositoryName,
      pullRequestLookup.pullRequestNumber,
      pullSnapshot,
      fileSnapshots,
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

  async enableAutoMerge(_method: MergeMethod): Promise<AutoMergeOutcome> {
    throw new Error("GitHubAdapter.enableAutoMerge is not implemented yet (slice 09).");
  }
}
