import { request } from "@octokit/request";
import { RequestError } from "@octokit/request-error";
import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";

import { createOctokitGithubApiClient } from "../adapters/github/octokitGithubApiClient.js";

describe("createOctokitGithubApiClient", () => {
  it("maps pulls.get into a pull snapshot (null user and sparse labels)", async () => {
    const pullsGet = vi.fn().mockResolvedValue({
      data: {
        node_id: "node-pr-1",
        head: { sha: "abc123" },
        base: { ref: "develop" },
        user: null,
        title: null,
        body: null,
        labels: [{ name: "bug" }, { name: null }, { name: "" }],
        created_at: "2026-05-01T12:00:00Z",
      },
    });
    const pullsListFiles = vi.fn();
    const checksCreate = vi.fn();
    const issuesCreateComment = vi.fn();
    const octokit = {
      rest: {
        pulls: { get: pullsGet, listFiles: pullsListFiles },
        checks: { create: checksCreate },
        issues: { createComment: issuesCreateComment, listComments: vi.fn(), updateComment: vi.fn() },
      },
      paginate: vi.fn().mockResolvedValue([
        { filename: "src/x.ts", status: "modified", additions: 2, deletions: 1 },
      ]),
    } as unknown as Octokit;

    const githubApiClient = createOctokitGithubApiClient(octokit);
    const pullSnapshot = await githubApiClient.getPullRequest({
      repositoryOwner: "acme",
      repositoryName: "demo",
      pullRequestNumber: 44,
    });

    expect(pullsGet).toHaveBeenCalledWith({
      owner: "acme",
      repo: "demo",
      pull_number: 44,
    });
    expect(pullSnapshot.headSha).toBe("abc123");
    expect(pullSnapshot.pullRequestNodeId).toBe("node-pr-1");
    expect(pullSnapshot.baseRefName).toBe("develop");
    expect(pullSnapshot.authorLogin).toBe("unknown");
    expect(pullSnapshot.title).toBe("");
    expect(pullSnapshot.body).toBe("");
    expect(pullSnapshot.labelNames).toEqual(["bug"]);
    expect(pullSnapshot.createdAtIso).toBe("2026-05-01T12:00:00Z");
  });

  it("paginates listFiles and maps rows to path snapshots", async () => {
    const pullsGet = vi.fn().mockResolvedValue({
      data: {
        node_id: "node-pr-2",
        head: { sha: "s" },
        base: { ref: "main" },
        user: { login: "bob" },
        title: "t",
        body: "b",
        labels: [],
        created_at: "2026-01-01T00:00:00Z",
      },
    });
    const pullsListFiles = vi.fn();
    const checksCreate = vi.fn();
    const issuesCreateComment = vi.fn();
    const paginate = vi.fn().mockResolvedValue([
      { filename: "a.ts", status: "added", additions: 10, deletions: 0 },
    ]);
    const octokit = {
      rest: {
        pulls: { get: pullsGet, listFiles: pullsListFiles },
        checks: { create: checksCreate },
        issues: { createComment: issuesCreateComment, listComments: vi.fn(), updateComment: vi.fn() },
      },
      paginate,
    } as unknown as Octokit;

    const githubApiClient = createOctokitGithubApiClient(octokit);
    const fileSnapshots = await githubApiClient.listPullRequestFiles({
      repositoryOwner: "o",
      repositoryName: "r",
      pullRequestNumber: 3,
    });

    expect(paginate).toHaveBeenCalledWith(pullsListFiles, {
      owner: "o",
      repo: "r",
      pull_number: 3,
      per_page: 100,
    });
    expect(fileSnapshots).toEqual([
      { path: "a.ts", status: "added", additions: 10, deletions: 0 },
    ]);
  });

  it("maps createMergeRiskCheckRun to rest.checks.create", async () => {
    const checksCreate = vi.fn().mockResolvedValue({});
    const octokit = {
      rest: {
        pulls: { get: vi.fn(), listFiles: vi.fn() },
        checks: { create: checksCreate },
        issues: { createComment: vi.fn(), listComments: vi.fn(), updateComment: vi.fn() },
      },
      paginate: vi.fn(),
    } as unknown as Octokit;

    const githubApiClient = createOctokitGithubApiClient(octokit);
    await githubApiClient.createMergeRiskCheckRun({
      repositoryOwner: "org",
      repositoryName: "repo",
      headSha: "deadbeef",
      name: "Merge risk",
      conclusion: "failure",
      summaryMarkdown: "## High\nDetails.",
    });

    expect(checksCreate).toHaveBeenCalledWith({
      owner: "org",
      repo: "repo",
      name: "Merge risk",
      head_sha: "deadbeef",
      status: "completed",
      conclusion: "failure",
      output: {
        title: "Merge risk",
        summary: "## High\nDetails.",
      },
    });
  });

  it("truncates check run summary markdown past GitHub output limit", async () => {
    const checksCreate = vi.fn().mockResolvedValue({});
    const octokit = {
      rest: {
        pulls: { get: vi.fn(), listFiles: vi.fn() },
        checks: { create: checksCreate },
        issues: { createComment: vi.fn(), listComments: vi.fn(), updateComment: vi.fn() },
      },
      paginate: vi.fn(),
    } as unknown as Octokit;

    const huge = "x".repeat(70000);
    const githubApiClient = createOctokitGithubApiClient(octokit);
    await githubApiClient.createMergeRiskCheckRun({
      repositoryOwner: "o",
      repositoryName: "r",
      headSha: "sha",
      name: "Merge risk",
      conclusion: "success",
      summaryMarkdown: huge,
    });

    const summary = checksCreate.mock.calls[0]![0].output.summary as string;
    expect(summary.length).toBeLessThanOrEqual(65535);
    expect(summary).toContain("truncated for GitHub check run output limit");
  });

  it("maps createPullRequestComment to rest.issues.createComment", async () => {
    const issuesCreateComment = vi.fn().mockResolvedValue({});
    const octokit = {
      rest: {
        pulls: { get: vi.fn(), listFiles: vi.fn() },
        checks: { create: vi.fn() },
        issues: { createComment: issuesCreateComment, listComments: vi.fn(), updateComment: vi.fn() },
      },
      paginate: vi.fn(),
    } as unknown as Octokit;

    const githubApiClient = createOctokitGithubApiClient(octokit);
    await githubApiClient.createPullRequestComment({
      repositoryOwner: "org",
      repositoryName: "repo",
      pullRequestNumber: 55,
      body: "Hello from Brindle",
    });

    expect(issuesCreateComment).toHaveBeenCalledWith({
      owner: "org",
      repo: "repo",
      issue_number: 55,
      body: "Hello from Brindle",
    });
  });

  it("paginates listPullRequestIssueComments from rest.issues.listComments", async () => {
    const issuesListComments = vi.fn();
    const paginate = vi.fn().mockResolvedValue([
      { id: 1, body: "noise" },
      { id: 2, body: "with marker <!-- brindle-merge-risk -->" },
    ]);
    const octokit = {
      rest: {
        pulls: { get: vi.fn(), listFiles: vi.fn() },
        checks: { create: vi.fn() },
        issues: { createComment: vi.fn(), listComments: issuesListComments, updateComment: vi.fn() },
      },
      paginate,
    } as unknown as Octokit;

    const githubApiClient = createOctokitGithubApiClient(octokit);
    const comments = await githubApiClient.listPullRequestIssueComments({
      repositoryOwner: "org",
      repositoryName: "repo",
      pullRequestNumber: 12,
    });

    expect(paginate).toHaveBeenCalledWith(issuesListComments, {
      owner: "org",
      repo: "repo",
      issue_number: 12,
      per_page: 100,
    });
    expect(comments).toEqual([
      { id: 1, body: "noise" },
      { id: 2, body: "with marker <!-- brindle-merge-risk -->" },
    ]);
  });

  it("maps updatePullRequestIssueComment to rest.issues.updateComment", async () => {
    const issuesUpdateComment = vi.fn().mockResolvedValue({});
    const octokit = {
      rest: {
        pulls: { get: vi.fn(), listFiles: vi.fn() },
        checks: { create: vi.fn() },
        issues: { createComment: vi.fn(), listComments: vi.fn(), updateComment: issuesUpdateComment },
      },
      paginate: vi.fn(),
    } as unknown as Octokit;

    const githubApiClient = createOctokitGithubApiClient(octokit);
    await githubApiClient.updatePullRequestIssueComment({
      repositoryOwner: "acme",
      repositoryName: "widgets",
      commentId: 999,
      body: "revised body",
    });

    expect(issuesUpdateComment).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widgets",
      comment_id: 999,
      body: "revised body",
    });
  });

  it("throws when enableNativePullRequestAutoMerge is called with an empty pullRequestNodeId", async () => {
    const octokit = {
      rest: {
        pulls: { get: vi.fn(), listFiles: vi.fn() },
        checks: { create: vi.fn() },
        issues: { createComment: vi.fn(), listComments: vi.fn(), updateComment: vi.fn() },
      },
      paginate: vi.fn(),
      request: vi.fn(),
    } as unknown as Octokit;

    const githubApiClient = createOctokitGithubApiClient(octokit);
    await expect(
      githubApiClient.enableNativePullRequestAutoMerge({
        repositoryOwner: "o",
        repositoryName: "r",
        pullRequestNumber: 1,
        pullRequestNodeId: "",
        mergeMethod: "squash",
      }),
    ).rejects.toThrow(/pullRequestNodeId/);
    expect(octokit.request).not.toHaveBeenCalled();
  });

  it("posts the enablePullRequestAutoMerge GraphQL mutation with the expected mergeMethod enum", async () => {
    const graphqlBodies: unknown[] = [];
    const mockFetch = vi.fn(async (_url: string, init?: RequestInit): Promise<Response> => {
      graphqlBodies.push(JSON.parse(String(init?.body ?? "{}")));
      const payload = {
        data: {
          enablePullRequestAutoMerge: {
            pullRequest: { id: "PR_from_graphql" },
          },
        },
      };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const boundRequest = request.defaults({
      request: { fetch: mockFetch },
    });

    const octokit = {
      rest: {
        pulls: { get: vi.fn(), listFiles: vi.fn() },
        checks: { create: vi.fn() },
        issues: { createComment: vi.fn(), listComments: vi.fn(), updateComment: vi.fn() },
      },
      paginate: vi.fn(),
      request: boundRequest,
    } as unknown as Octokit;

    const githubApiClient = createOctokitGithubApiClient(octokit);

    await githubApiClient.enableNativePullRequestAutoMerge({
      repositoryOwner: "o",
      repositoryName: "r",
      pullRequestNumber: 9,
      pullRequestNodeId: "node-pr-9",
      mergeMethod: "merge",
    });
    await githubApiClient.enableNativePullRequestAutoMerge({
      repositoryOwner: "o",
      repositoryName: "r",
      pullRequestNumber: 9,
      pullRequestNodeId: "node-pr-9",
      mergeMethod: "rebase",
    });
    await githubApiClient.enableNativePullRequestAutoMerge({
      repositoryOwner: "o",
      repositoryName: "r",
      pullRequestNumber: 9,
      pullRequestNodeId: "node-pr-9",
      mergeMethod: "squash",
    });

    expect(mockFetch).toHaveBeenCalled();
    const mergeMethods = graphqlBodies.map(
      (body) => (body as { variables?: { mergeMethod?: string } }).variables?.mergeMethod,
    );
    expect(mergeMethods).toEqual(["MERGE", "REBASE", "SQUASH"]);
    expect((graphqlBodies[0] as { variables?: { pullRequestId?: string } }).variables?.pullRequestId).toBe(
      "node-pr-9",
    );
  });

  it("returns null from getRepositoryFileTextAtRef when GitHub returns 404", async () => {
    const reposGetContent = vi.fn().mockRejectedValue(
      new RequestError("Not Found", 404, {
        request: { method: "GET", url: "https://api.github.com/repos/o/r/contents/x", headers: {} },
      }),
    );
    const octokit = {
      rest: {
        pulls: { get: vi.fn(), listFiles: vi.fn() },
        checks: { create: vi.fn() },
        issues: { createComment: vi.fn(), listComments: vi.fn(), updateComment: vi.fn() },
        repos: { getContent: reposGetContent },
      },
      paginate: vi.fn(),
    } as unknown as Octokit;

    const githubApiClient = createOctokitGithubApiClient(octokit);
    await expect(
      githubApiClient.getRepositoryFileTextAtRef({
        repositoryOwner: "o",
        repositoryName: "r",
        path: "coverage.json",
        ref: "abc",
      }),
    ).resolves.toBeNull();
  });

  it("returns UTF-8 file contents from getRepositoryFileTextAtRef", async () => {
    const payload = '{"hello":"world"}';
    const reposGetContent = vi.fn().mockResolvedValue({
      data: {
        type: "file",
        encoding: "base64",
        content: Buffer.from(payload, "utf8").toString("base64"),
      },
    });
    const octokit = {
      rest: {
        pulls: { get: vi.fn(), listFiles: vi.fn() },
        checks: { create: vi.fn() },
        issues: { createComment: vi.fn(), listComments: vi.fn(), updateComment: vi.fn() },
        repos: { getContent: reposGetContent },
      },
      paginate: vi.fn(),
    } as unknown as Octokit;

    const githubApiClient = createOctokitGithubApiClient(octokit);
    await expect(
      githubApiClient.getRepositoryFileTextAtRef({
        repositoryOwner: "o",
        repositoryName: "r",
        path: "report.json",
        ref: "main",
      }),
    ).resolves.toBe(payload);
    expect(reposGetContent).toHaveBeenCalledWith({
      owner: "o",
      repo: "r",
      path: "report.json",
      ref: "main",
    });
  });

  it("maps getRepositoryCommitCommittedAtIso to rest.repos.getCommit committer date", async () => {
    const reposGetCommit = vi.fn().mockResolvedValue({
      data: {
        commit: {
          committer: { date: "2026-04-01T08:30:00Z", name: "GitHub", email: "noreply@github.com" },
        },
      },
    });
    const octokit = {
      rest: {
        pulls: { get: vi.fn(), listFiles: vi.fn() },
        checks: { create: vi.fn() },
        issues: { createComment: vi.fn(), listComments: vi.fn(), updateComment: vi.fn() },
        repos: { getContent: vi.fn(), getCommit: reposGetCommit },
      },
      paginate: vi.fn(),
    } as unknown as Octokit;

    const githubApiClient = createOctokitGithubApiClient(octokit);
    await expect(
      githubApiClient.getRepositoryCommitCommittedAtIso({
        repositoryOwner: "acme",
        repositoryName: "demo",
        ref: "abc123deadbeef",
      }),
    ).resolves.toBe("2026-04-01T08:30:00Z");
    expect(reposGetCommit).toHaveBeenCalledWith({
      owner: "acme",
      repo: "demo",
      ref: "abc123deadbeef",
    });
  });

  it("returns null from getRepositoryCommitCommittedAtIso when GitHub returns 404", async () => {
    const reposGetCommit = vi.fn().mockRejectedValue(
      new RequestError("Not Found", 404, {
        request: { method: "GET", url: "https://api.github.com/repos/o/r/commits/x", headers: {} },
      }),
    );
    const octokit = {
      rest: {
        pulls: { get: vi.fn(), listFiles: vi.fn() },
        checks: { create: vi.fn() },
        issues: { createComment: vi.fn(), listComments: vi.fn(), updateComment: vi.fn() },
        repos: { getCommit: reposGetCommit },
      },
      paginate: vi.fn(),
    } as unknown as Octokit;

    const githubApiClient = createOctokitGithubApiClient(octokit);
    await expect(
      githubApiClient.getRepositoryCommitCommittedAtIso({
        repositoryOwner: "o",
        repositoryName: "r",
        ref: "missing",
      }),
    ).resolves.toBeNull();
  });

  it("returns null from getRepositoryCommitCommittedAtIso when committer date is missing", async () => {
    const reposGetCommit = vi.fn().mockResolvedValue({
      data: { commit: { committer: null } },
    });
    const octokit = {
      rest: {
        pulls: { get: vi.fn(), listFiles: vi.fn() },
        checks: { create: vi.fn() },
        issues: { createComment: vi.fn(), listComments: vi.fn(), updateComment: vi.fn() },
        repos: { getCommit: reposGetCommit },
      },
      paginate: vi.fn(),
    } as unknown as Octokit;

    const githubApiClient = createOctokitGithubApiClient(octokit);
    await expect(
      githubApiClient.getRepositoryCommitCommittedAtIso({
        repositoryOwner: "o",
        repositoryName: "r",
        ref: "sha",
      }),
    ).resolves.toBeNull();
  });

  it("rethrows getRepositoryFileTextAtRef when GitHub returns a non-404 error", async () => {
    const serverError = new RequestError("Internal Error", 500, {
      request: { method: "GET", url: "https://api.github.com/repos/o/r/contents/x", headers: {} },
    });
    const reposGetContent = vi.fn().mockRejectedValue(serverError);
    const octokit = {
      rest: {
        pulls: { get: vi.fn(), listFiles: vi.fn() },
        checks: { create: vi.fn() },
        issues: { createComment: vi.fn(), listComments: vi.fn(), updateComment: vi.fn() },
        repos: { getContent: reposGetContent },
      },
      paginate: vi.fn(),
    } as unknown as Octokit;

    const githubApiClient = createOctokitGithubApiClient(octokit);
    await expect(
      githubApiClient.getRepositoryFileTextAtRef({
        repositoryOwner: "o",
        repositoryName: "r",
        path: "x",
        ref: "main",
      }),
    ).rejects.toBe(serverError);
  });
});
