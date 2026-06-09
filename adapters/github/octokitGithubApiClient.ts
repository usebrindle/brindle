/**
 * {@link GitHubApiClient} backed by `@octokit/rest` (reads for context, check runs and PR comments for results).
 *
 * @see docs/adrs/0007-platform-adapter-boundary.md
 */
import { withCustomRequest } from "@octokit/graphql";
import { RequestError } from "@octokit/request-error";
import { Octokit } from "@octokit/rest";

import type { MergeMethod } from "../../core/types.js";
import { decodeGithubRepositoryContentFile } from "./decodeGithubRepositoryContentFile.js";
import type {
  CreateMergeRiskCheckRunInput,
  CreatePullRequestCommentInput,
  EnableNativePullRequestAutoMergeInput,
  GetRepositoryCommitCommittedAtIsoInput,
  GetRepositoryFileTextAtRefInput,
  GitHubApiClient,
  GitHubPullFileSnapshot,
  GitHubPullRequestLookup,
  GitHubPullSnapshot,
  PullRequestIssueCommentSnapshot,
  UpdatePullRequestIssueCommentInput,
} from "./githubAdapter.types.js";

/** GitHub `checks` API `output.summary` maximum length (characters). */
const GITHUB_CHECK_RUN_OUTPUT_SUMMARY_MAX_CHARS = 65535;

const truncateCheckRunSummaryMarkdown = (markdown: string): string => {
  if (markdown.length <= GITHUB_CHECK_RUN_OUTPUT_SUMMARY_MAX_CHARS) {
    return markdown;
  }
  const suffix = "\n\n_(Summary truncated for GitHub check run output limit.)_";
  const headLength = GITHUB_CHECK_RUN_OUTPUT_SUMMARY_MAX_CHARS - suffix.length;
  return `${markdown.slice(0, Math.max(0, headLength))}${suffix}`;
};

const ENABLE_PULL_REQUEST_AUTO_MERGE_MUTATION = `
mutation EnablePullRequestAutoMerge($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
  enablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId, mergeMethod: $mergeMethod }) {
    pullRequest {
      id
    }
  }
}
`;

const mergeMethodToGithubGraphQlEnum = (mergeMethod: MergeMethod): "MERGE" | "REBASE" | "SQUASH" => {
  if (mergeMethod === "merge") return "MERGE";
  if (mergeMethod === "rebase") return "REBASE";
  return "SQUASH";
};

const commitCommittedAtIsoFromRestPayload = (data: {
  commit?: { committer?: { date?: string | null } | null } | null;
}): string | null => {
  const rawDate = data.commit?.committer?.date;
  if (typeof rawDate !== "string" || rawDate.trim() === "") {
    return null;
  }
  return rawDate;
};

const toPullSnapshot = (data: {
  node_id?: string;
  head: { sha: string };
  base: { ref: string };
  user: { login: string } | null;
  title: string | null;
  body: string | null;
  labels: { name?: string | null }[];
  created_at: string;
}): GitHubPullSnapshot => ({
  pullRequestNodeId: typeof data.node_id === "string" ? data.node_id : "",
  headSha: data.head.sha,
  baseRefName: data.base.ref,
  authorLogin: data.user?.login ?? "unknown",
  title: data.title ?? "",
  body: data.body ?? "",
  labelNames: data.labels.map((label) => label.name ?? "").filter((name) => name.length > 0),
  createdAtIso: data.created_at,
});

/**
 * @param octokit - Authenticated REST client (typically `GITHUB_TOKEN` in Actions).
 */
export const createOctokitGithubApiClient = (octokit: Octokit): GitHubApiClient => ({
  async getPullRequest(lookup: GitHubPullRequestLookup): Promise<GitHubPullSnapshot> {
    const { data } = await octokit.rest.pulls.get({
      owner: lookup.repositoryOwner,
      repo: lookup.repositoryName,
      pull_number: lookup.pullRequestNumber,
    });
    return toPullSnapshot(data);
  },

  async listPullRequestFiles(lookup: GitHubPullRequestLookup): Promise<GitHubPullFileSnapshot[]> {
    const rows = await octokit.paginate(octokit.rest.pulls.listFiles, {
      owner: lookup.repositoryOwner,
      repo: lookup.repositoryName,
      pull_number: lookup.pullRequestNumber,
      per_page: 100,
    });
    return rows.map((row) => ({
      path: row.filename,
      status: row.status,
      additions: row.additions,
      deletions: row.deletions,
    }));
  },

  async getRepositoryFileTextAtRef(input: GetRepositoryFileTextAtRefInput): Promise<string | null> {
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner: input.repositoryOwner,
        repo: input.repositoryName,
        path: input.path,
        ref: input.ref,
      });
      return decodeGithubRepositoryContentFile(data, input.path);
    } catch (cause: unknown) {
      if (cause instanceof RequestError && cause.status === 404) {
        return null;
      }
      throw cause;
    }
  },

  async getRepositoryCommitCommittedAtIso(
    input: GetRepositoryCommitCommittedAtIsoInput,
  ): Promise<string | null> {
    try {
      const { data } = await octokit.rest.repos.getCommit({
        owner: input.repositoryOwner,
        repo: input.repositoryName,
        ref: input.ref,
      });
      return commitCommittedAtIsoFromRestPayload(data);
    } catch (cause: unknown) {
      if (cause instanceof RequestError && cause.status === 404) {
        return null;
      }
      throw cause;
    }
  },

  async createMergeRiskCheckRun(input: CreateMergeRiskCheckRunInput): Promise<void> {
    await octokit.rest.checks.create({
      owner: input.repositoryOwner,
      repo: input.repositoryName,
      name: input.name,
      head_sha: input.headSha,
      status: "completed",
      conclusion: input.conclusion,
      output: {
        title: input.name,
        summary: truncateCheckRunSummaryMarkdown(input.summaryMarkdown),
      },
    });
  },

  async createPullRequestComment(input: CreatePullRequestCommentInput): Promise<void> {
    await octokit.rest.issues.createComment({
      owner: input.repositoryOwner,
      repo: input.repositoryName,
      issue_number: input.pullRequestNumber,
      body: input.body,
    });
  },

  async listPullRequestIssueComments(lookup: GitHubPullRequestLookup): Promise<PullRequestIssueCommentSnapshot[]> {
    const rows = await octokit.paginate(octokit.rest.issues.listComments, {
      owner: lookup.repositoryOwner,
      repo: lookup.repositoryName,
      issue_number: lookup.pullRequestNumber,
      per_page: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      body: typeof row.body === "string" ? row.body : "",
    }));
  },

  async updatePullRequestIssueComment(input: UpdatePullRequestIssueCommentInput): Promise<void> {
    await octokit.rest.issues.updateComment({
      owner: input.repositoryOwner,
      repo: input.repositoryName,
      comment_id: input.commentId,
      body: input.body,
    });
  },

  async enableNativePullRequestAutoMerge(input: EnableNativePullRequestAutoMergeInput): Promise<void> {
    if (input.pullRequestNodeId === "") {
      throw new Error(
        "enableNativePullRequestAutoMerge requires pullRequestNodeId (GitHub REST pull `node_id`).",
      );
    }
    const graphqlWithOctokitRequest = withCustomRequest(octokit.request);
    await graphqlWithOctokitRequest(ENABLE_PULL_REQUEST_AUTO_MERGE_MUTATION, {
      pullRequestId: input.pullRequestNodeId,
      mergeMethod: mergeMethodToGithubGraphQlEnum(input.mergeMethod),
    });
  },
});
