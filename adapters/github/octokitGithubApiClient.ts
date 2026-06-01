/**
 * {@link GitHubApiClient} backed by `@octokit/rest` (paginated file list).
 *
 * @see docs/adrs/0007-platform-adapter-boundary.md
 */
import { Octokit } from "@octokit/rest";

import type {
  GitHubApiClient,
  GitHubPullFileSnapshot,
  GitHubPullRequestLookup,
  GitHubPullSnapshot,
} from "./githubAdapter.types.js";

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
});
