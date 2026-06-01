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

  constructor(githubAdapterDependencies: GitHubAdapterDependencies) {
    this.githubAdapterDependencies = githubAdapterDependencies;
  }

  async buildContext(): Promise<PRContext> {
    const pullRequestLookup = {
      repositoryOwner: this.githubAdapterDependencies.repositoryOwner,
      repositoryName: this.githubAdapterDependencies.repositoryName,
      pullRequestNumber: this.githubAdapterDependencies.pullRequestNumber,
    };
    const { githubApiClient } = this.githubAdapterDependencies;
    const pullSnapshot = await githubApiClient.getPullRequest(pullRequestLookup);
    const fileSnapshots = await githubApiClient.listPullRequestFiles(pullRequestLookup);
    return mapGitHubPullAndFilesToPRContext(
      pullRequestLookup.repositoryOwner,
      pullRequestLookup.repositoryName,
      pullRequestLookup.pullRequestNumber,
      pullSnapshot,
      fileSnapshots,
    );
  }

  async writeResult(_report: RiskReport): Promise<void> {
    throw new Error("GitHubAdapter.writeResult is not implemented yet (slice 07).");
  }

  async enableAutoMerge(_method: MergeMethod): Promise<AutoMergeOutcome> {
    throw new Error("GitHubAdapter.enableAutoMerge is not implemented yet (slice 07).");
  }
}
