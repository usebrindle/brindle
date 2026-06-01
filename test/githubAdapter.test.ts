import { describe, expect, it } from "vitest";

import { GitHubAdapter } from "../adapters/github/GitHubAdapter.js";
import type {
  GitHubApiClient,
  GitHubPullFileSnapshot,
  GitHubPullSnapshot,
} from "../adapters/github/githubAdapter.types.js";
import { mapGitHubPullAndFilesToPRContext } from "../adapters/github/mapGitHubPullToPrContext.js";
import type { RiskReport } from "../core/types.js";

const samplePullSnapshot = (): GitHubPullSnapshot => ({
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
    const mockGithubApiClient: GitHubApiClient = {
      getPullRequest: async () => samplePullSnapshot(),
      listPullRequestFiles: async () => sampleFileSnapshots(),
    };
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

  it("rejects writeResult until slice 07", async () => {
    const mockGithubApiClient: GitHubApiClient = {
      getPullRequest: async () => samplePullSnapshot(),
      listPullRequestFiles: async () => [],
    };
    const githubAdapter = new GitHubAdapter({
      githubApiClient: mockGithubApiClient,
      repositoryOwner: "acme",
      repositoryName: "demo",
      pullRequestNumber: 1,
    });
    await expect(githubAdapter.writeResult({} as RiskReport)).rejects.toThrow(/slice 07/);
  });
});
