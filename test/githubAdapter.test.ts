import { describe, expect, it, vi } from "vitest";

import { GraphqlResponseError } from "@octokit/graphql";

import { GitHubAdapter } from "../adapters/github/GitHubAdapter.js";
import type {
  GitHubApiClient,
  GitHubPullFileSnapshot,
  GitHubPullSnapshot,
} from "../adapters/github/githubAdapter.types.js";
import { mapGitHubPullAndFilesToPRContext } from "../adapters/github/mapGitHubPullToPrContext.js";
import type { RiskReport } from "../core/types.js";

const samplePullSnapshot = (): GitHubPullSnapshot => ({
  pullRequestNodeId: "PRR_kwDOABC123",
  headSha: "headdeadbeef",
  baseRefName: "main",
  authorLogin: "alice",
  title: "Add widget",
  body: "Desc",
  labelNames: ["area:core"],
  createdAtIso: "2026-01-02T00:00:00Z",
});

const sampleFileSnapshots = (): GitHubPullFileSnapshot[] => [
  { path: "src/a.ts", status: "modified", additions: 3, deletions: 1 },
  { path: "src/b.ts", status: "added", additions: 10, deletions: 0 },
];

const sampleRiskReport = (): RiskReport => ({
  result: {
    score: 10,
    tier: "LOW",
    breakdown: [],
    mutatorsApplied: [],
    disabledCriteria: [],
  },
  commentMarkdown: "## Merge risk\nLow.",
  checkConclusion: "success",
  autoMergeOutcome: "skipped",
});

const createMockGithubApiClient = (
  overrides: Partial<GitHubApiClient> = {},
): GitHubApiClient => ({
  getPullRequest: async () => samplePullSnapshot(),
  listPullRequestFiles: async () => [],
  createMergeRiskCheckRun: vi.fn().mockResolvedValue(undefined),
  createPullRequestComment: vi.fn().mockResolvedValue(undefined),
  enableNativePullRequestAutoMerge: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe("mapGitHubPullAndFilesToPRContext", () => {
  it("maps repo slug, totals, and file rows", () => {
    const pullContext = mapGitHubPullAndFilesToPRContext(
      "acme",
      "demo",
      42,
      samplePullSnapshot(),
      sampleFileSnapshots(),
    );
    expect(pullContext.repoSlug).toBe("acme/demo");
    expect(pullContext.changeNumber).toBe(42);
    expect(pullContext.headSha).toBe("headdeadbeef");
    expect(pullContext.baseRef).toBe("main");
    expect(pullContext.author).toBe("alice");
    expect(pullContext.title).toBe("Add widget");
    expect(pullContext.body).toBe("Desc");
    expect(pullContext.labels).toEqual(["area:core"]);
    expect(pullContext.createdAt).toBe("2026-01-02T00:00:00Z");
    expect(pullContext.files).toHaveLength(2);
    expect(pullContext.files[0]!.path).toBe("src/a.ts");
    expect(pullContext.totalAdditions).toBe(13);
    expect(pullContext.totalDeletions).toBe(1);
  });

  it("handles an empty file list", () => {
    const pullContext = mapGitHubPullAndFilesToPRContext(
      "acme",
      "demo",
      1,
      samplePullSnapshot(),
      [],
    );
    expect(pullContext.files).toEqual([]);
    expect(pullContext.totalAdditions).toBe(0);
    expect(pullContext.totalDeletions).toBe(0);
  });
});

describe("GitHubAdapter.buildContext", () => {
  it("delegates to the injected client then maps to PRContext", async () => {
    const mockGithubApiClient = createMockGithubApiClient({
      listPullRequestFiles: async () => sampleFileSnapshots(),
    });
    const githubAdapter = new GitHubAdapter({
      githubApiClient: mockGithubApiClient,
      repositoryOwner: "acme",
      repositoryName: "demo",
      pullRequestNumber: 7,
    });
    const pullContext = await githubAdapter.buildContext();
    expect(pullContext.repoSlug).toBe("acme/demo");
    expect(pullContext.changeNumber).toBe(7);
    expect(pullContext.totalAdditions).toBe(13);
  });
});

describe("GitHubAdapter.writeResult", () => {
  it("rejects when buildContext was never run", async () => {
    const mockGithubApiClient = createMockGithubApiClient();
    const githubAdapter = new GitHubAdapter({
      githubApiClient: mockGithubApiClient,
      repositoryOwner: "acme",
      repositoryName: "demo",
      pullRequestNumber: 1,
    });
    await expect(githubAdapter.writeResult(sampleRiskReport())).rejects.toThrow(/buildContext/);
    expect(mockGithubApiClient.createMergeRiskCheckRun).not.toHaveBeenCalled();
  });

  it("creates a check run on the head SHA from the last buildContext", async () => {
    const createMergeRiskCheckRun = vi.fn().mockResolvedValue(undefined);
    const createPullRequestComment = vi.fn().mockResolvedValue(undefined);
    const mockGithubApiClient = createMockGithubApiClient({
      createMergeRiskCheckRun,
      createPullRequestComment,
    });
    const githubAdapter = new GitHubAdapter({
      githubApiClient: mockGithubApiClient,
      repositoryOwner: "acme",
      repositoryName: "demo",
      pullRequestNumber: 99,
      mergeRiskCheckRunName: "Brindle merge risk",
    });
    await githubAdapter.buildContext();
    await githubAdapter.writeResult({
      ...sampleRiskReport(),
      checkConclusion: "neutral",
    });
    expect(createMergeRiskCheckRun).toHaveBeenCalledWith({
      repositoryOwner: "acme",
      repositoryName: "demo",
      headSha: "headdeadbeef",
      name: "Brindle merge risk",
      conclusion: "neutral",
      summaryMarkdown: "## Merge risk\nLow.",
    });
    expect(createPullRequestComment).toHaveBeenCalledWith({
      repositoryOwner: "acme",
      repositoryName: "demo",
      pullRequestNumber: 99,
      body: "## Merge risk\nLow.",
    });
  });

  it("defaults the check run name to Merge risk", async () => {
    const createMergeRiskCheckRun = vi.fn().mockResolvedValue(undefined);
    const githubAdapter = new GitHubAdapter({
      githubApiClient: createMockGithubApiClient({ createMergeRiskCheckRun }),
      repositoryOwner: "a",
      repositoryName: "b",
      pullRequestNumber: 1,
    });
    await githubAdapter.buildContext();
    await githubAdapter.writeResult(sampleRiskReport());
    expect(createMergeRiskCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Merge risk" }),
    );
  });

  it("skips the PR comment when postRiskSummaryComment is false", async () => {
    const createMergeRiskCheckRun = vi.fn().mockResolvedValue(undefined);
    const createPullRequestComment = vi.fn().mockResolvedValue(undefined);
    const githubAdapter = new GitHubAdapter({
      githubApiClient: createMockGithubApiClient({
        createMergeRiskCheckRun,
        createPullRequestComment,
      }),
      repositoryOwner: "o",
      repositoryName: "r",
      pullRequestNumber: 3,
      postRiskSummaryComment: false,
    });
    await githubAdapter.buildContext();
    await githubAdapter.writeResult(sampleRiskReport());
    expect(createMergeRiskCheckRun).toHaveBeenCalled();
    expect(createPullRequestComment).not.toHaveBeenCalled();
  });

  it("skips the PR comment when comment markdown is empty or whitespace-only", async () => {
    const createPullRequestComment = vi.fn().mockResolvedValue(undefined);
    const githubAdapter = new GitHubAdapter({
      githubApiClient: createMockGithubApiClient({ createPullRequestComment }),
      repositoryOwner: "o",
      repositoryName: "r",
      pullRequestNumber: 3,
    });
    await githubAdapter.buildContext();
    await githubAdapter.writeResult({
      ...sampleRiskReport(),
      commentMarkdown: "   \n\t  ",
    });
    expect(createPullRequestComment).not.toHaveBeenCalled();
  });
});

describe("GitHubAdapter.enableAutoMerge", () => {
  it("calls enableNativePullRequestAutoMerge after buildContext and returns enabled", async () => {
    const enableNativePullRequestAutoMerge = vi.fn().mockResolvedValue(undefined);
    const githubAdapter = new GitHubAdapter({
      githubApiClient: createMockGithubApiClient({ enableNativePullRequestAutoMerge }),
      repositoryOwner: "acme",
      repositoryName: "demo",
      pullRequestNumber: 7,
    });
    await githubAdapter.buildContext();
    const outcome = await githubAdapter.enableAutoMerge("merge");
    expect(outcome).toBe("enabled");
    expect(enableNativePullRequestAutoMerge).toHaveBeenCalledWith({
      repositoryOwner: "acme",
      repositoryName: "demo",
      pullRequestNumber: 7,
      pullRequestNodeId: "PRR_kwDOABC123",
      mergeMethod: "merge",
    });
  });

  it("returns setting_off when GraphQL enable auto-merge fails", async () => {
    const enableNativePullRequestAutoMerge = vi.fn().mockRejectedValue(
      new GraphqlResponseError(
        { method: "POST", url: "https://api.github.com/graphql", query: "mutation" },
        {},
        {
          data: {},
          errors: [
            {
              type: "ERROR",
              message: "Auto merge is not allowed",
              path: ["enablePullRequestAutoMerge"],
              locations: [{ line: 1, column: 1 }],
              extensions: {},
            },
          ],
        },
      ),
    );
    const githubAdapter = new GitHubAdapter({
      githubApiClient: createMockGithubApiClient({ enableNativePullRequestAutoMerge }),
      repositoryOwner: "acme",
      repositoryName: "demo",
      pullRequestNumber: 1,
    });
    await githubAdapter.buildContext();
    await expect(githubAdapter.enableAutoMerge("squash")).resolves.toBe("setting_off");
  });

  it("rejects enableAutoMerge when buildContext was never run", async () => {
    const mockGithubApiClient = createMockGithubApiClient();
    const githubAdapter = new GitHubAdapter({
      githubApiClient: mockGithubApiClient,
      repositoryOwner: "acme",
      repositoryName: "demo",
      pullRequestNumber: 1,
    });
    await expect(githubAdapter.enableAutoMerge("squash")).rejects.toThrow(/buildContext/);
    expect(mockGithubApiClient.enableNativePullRequestAutoMerge).not.toHaveBeenCalled();
  });
});
