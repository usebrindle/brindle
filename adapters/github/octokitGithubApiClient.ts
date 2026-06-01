/**
 * {@link GitHubApiClient} backed by `@octokit/rest` (reads for context, check runs and PR comments for results).
 *
 * @see docs/adrs/0007-platform-adapter-boundary.md
 */
import { Octokit } from "@octokit/rest";

import type {
  CreateMergeRiskCheckRunInput,
  CreatePullRequestCommentInput,
  GitHubApiClient,
  GitHubPullFileSnapshot,
  GitHubPullRequestLookup,
  GitHubPullSnapshot,
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

const toPullSnapshot = (data: {
  head: { sha: string };
  base: { ref: string };
  user: { login: string } | null;
  title: string | null;
  body: string | null;
  labels: { name?: string | null }[];
  created_at: string;
}): GitHubPullSnapshot => ({
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
});
