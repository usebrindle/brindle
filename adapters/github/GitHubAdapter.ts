/**
 * GitHub implementation of {@link PlatformAdapter}: hydrates {@link PRContext} from the REST API.
 *
 * @see docs/adrs/0001-no-pr-head-execution.md
 * @see docs/adrs/0002-native-auto-merge.md
 * @see docs/adrs/0007-platform-adapter-boundary.md
 */
import { GraphqlResponseError } from "@octokit/graphql";

import { parseCoverageArtifactText } from "../../core/coverage/adapter.js";
import { IstanbulCoverageParseError } from "../../core/coverage/istanbul.js";
import { BRINDLE_MERGE_RISK_COMMENT_MARKER } from "../../core/report.js";
import type { AutoMergeOutcome, MergeMethod, PRContext, RiskReport } from "../../core/types.js";
import type { PlatformAdapter } from "../PlatformAdapter.js";

import type {
  GitHubAdapterDependencies,
  GitHubApiClient,
  GitHubPullRequestLookup,
  GitHubPullSnapshot,
  GitHubTemporalContextHydration,
} from "./githubAdapter.types.js";
import { hydrateContextualEvidence } from "./contextual/hydrateContextualEvidence.js";
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

const hydrateIstanbulCoverageForPull = async (
  istanbulCoverageHydration: GitHubAdapterDependencies["istanbulCoverageHydration"],
  githubApiClient: GitHubApiClient,
  pullRequestLookup: GitHubPullRequestLookup,
  headSha: string,
): Promise<PRContext["coverage"]> => {
  if (
    istanbulCoverageHydration?.shouldHydrate !== true ||
    istanbulCoverageHydration.repositoryRelativePath.trim() === ""
  ) {
    return undefined;
  }

  const rawCoverageJson = await githubApiClient.getRepositoryFileTextAtRef({
    repositoryOwner: pullRequestLookup.repositoryOwner,
    repositoryName: pullRequestLookup.repositoryName,
    path: istanbulCoverageHydration.repositoryRelativePath.trim(),
    ref: headSha,
  });

  if (rawCoverageJson === null || rawCoverageJson.trim() === "") {
    return undefined;
  }

  try {
    return parseCoverageArtifactText({
      format: "istanbul",
      text: rawCoverageJson,
    });
  } catch (cause: unknown) {
    if (!(cause instanceof IstanbulCoverageParseError)) {
      throw cause;
    }
    return undefined;
  }
};

const mergeContextualEvidenceIntoPullContext = (
  pullContext: PRContext,
  contextualEvidenceHydration: NonNullable<
    GitHubAdapterDependencies["contextualEvidenceHydration"]
  >,
  hydrateContextualEvidenceFn: typeof hydrateContextualEvidence,
  pullSnapshot: GitHubPullSnapshot,
  changedPaths: readonly string[],
  classifiedAtIso: string,
): PRContext => {
  const contextualHydrationResult = hydrateContextualEvidenceFn({
    repositoryRoot: contextualEvidenceHydration.repositoryRoot,
    baseRef: pullSnapshot.baseRefName,
    headRef: pullSnapshot.headSha,
    authorLogin: pullSnapshot.authorLogin,
    changedPaths,
    classifiedAt: new Date(classifiedAtIso),
    hydrateAuthorFamiliarity: contextualEvidenceHydration.hydrateAuthorFamiliarity,
    hydrateBlastRadius: contextualEvidenceHydration.hydrateBlastRadius,
    authorFamiliarityOptions: contextualEvidenceHydration.authorFamiliarityOptions,
    blastRadiusOptions: contextualEvidenceHydration.blastRadiusOptions,
    dependencies: contextualEvidenceHydration.dependencies,
  });

  return {
    ...pullContext,
    contextualEvidence: contextualHydrationResult.contextualEvidence,
    ...(contextualHydrationResult.baseRevision === undefined
      ? {}
      : { baseRevision: contextualHydrationResult.baseRevision }),
    ...(contextualHydrationResult.authorEmails === undefined
      ? {}
      : { authorEmails: contextualHydrationResult.authorEmails }),
  };
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

    const coverageReport = await hydrateIstanbulCoverageForPull(
      this.githubAdapterDependencies.istanbulCoverageHydration,
      githubApiClient,
      pullRequestLookup,
      pullSnapshot.headSha,
    );

    const headCommitCommittedAtIso = await githubApiClient.getRepositoryCommitCommittedAtIso({
      repositoryOwner: pullRequestLookup.repositoryOwner,
      repositoryName: pullRequestLookup.repositoryName,
      ref: pullSnapshot.headSha,
    });

    const classifiedAtIso = new Date().toISOString();

    const temporalHydration: GitHubTemporalContextHydration = {
      classifiedAtIso,
      ...(headCommitCommittedAtIso !== null && headCommitCommittedAtIso.trim() !== ""
        ? { headCommitCommittedAtIso: headCommitCommittedAtIso }
        : {}),
    };

    let pullContext = mapGitHubPullAndFilesToPRContext(
      pullRequestLookup.repositoryOwner,
      pullRequestLookup.repositoryName,
      pullRequestLookup.pullRequestNumber,
      pullSnapshot,
      fileSnapshots,
      coverageReport,
      temporalHydration,
    );

    const contextualEvidenceHydration = this.githubAdapterDependencies.contextualEvidenceHydration;
    if (contextualEvidenceHydration?.shouldHydrate === true) {
      const hydrateContextualEvidenceFn =
        this.githubAdapterDependencies.hydrateContextualEvidence ?? hydrateContextualEvidence;
      pullContext = mergeContextualEvidenceIntoPullContext(
        pullContext,
        contextualEvidenceHydration,
        hydrateContextualEvidenceFn,
        pullSnapshot,
        fileSnapshots.map((fileSnapshot) => fileSnapshot.path),
        classifiedAtIso,
      );
    }

    return pullContext;
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
      const pullRequestLookup = {
        repositoryOwner,
        repositoryName,
        pullRequestNumber,
      };
      const priorIssueComments = await githubApiClient.listPullRequestIssueComments(pullRequestLookup);
      const lastBrindleComment = [...priorIssueComments]
        .reverse()
        .find((issueComment) => issueComment.body.includes(BRINDLE_MERGE_RISK_COMMENT_MARKER));
      if (lastBrindleComment === undefined) {
        await githubApiClient.createPullRequestComment({
          repositoryOwner,
          repositoryName,
          pullRequestNumber,
          body: report.commentMarkdown,
        });
      } else {
        await githubApiClient.updatePullRequestIssueComment({
          repositoryOwner,
          repositoryName,
          commentId: lastBrindleComment.id,
          body: report.commentMarkdown,
        });
      }
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
