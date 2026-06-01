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
        issues: { createComment: issuesCreateComment },
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
        issues: { createComment: issuesCreateComment },
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
        issues: { createComment: vi.fn() },
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
        issues: { createComment: vi.fn() },
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
        issues: { createComment: issuesCreateComment },
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
});
