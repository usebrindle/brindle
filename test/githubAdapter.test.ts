import { describe, expect, it, vi } from "vitest";

import { GraphqlResponseError } from "@octokit/graphql";

import { GitHubAdapter } from "../adapters/github/GitHubAdapter.js";
import type {
  GitHubApiClient,
  GitHubPullFileSnapshot,
  GitHubPullSnapshot,
} from "../adapters/github/githubAdapter.types.js";
import { mapGitHubPullAndFilesToPRContext } from "../adapters/github/mapGitHubPullToPrContext.js";
import { BRINDLE_MERGE_RISK_COMMENT_MARKER } from "../core/report.js";
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
  getRepositoryFileTextAtRef: vi.fn().mockResolvedValue(null),
  getRepositoryCommitCommittedAtIso: vi.fn().mockResolvedValue(null),
  createMergeRiskCheckRun: vi.fn().mockResolvedValue(undefined),
  createPullRequestComment: vi.fn().mockResolvedValue(undefined),
  listPullRequestIssueComments: vi.fn().mockResolvedValue([]),
  updatePullRequestIssueComment: vi.fn().mockResolvedValue(undefined),
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

  it("attaches coverage when a sixth argument is provided", () => {
    const pullContext = mapGitHubPullAndFilesToPRContext(
      "acme",
      "demo",
      1,
      samplePullSnapshot(),
      [],
      { linesCovered: 9, linesTotal: 10 },
    );
    expect(pullContext.coverage).toEqual({ linesCovered: 9, linesTotal: 10 });
  });

  it("attaches temporal hydration when a seventh argument is provided", () => {
    const pullContext = mapGitHubPullAndFilesToPRContext(
      "acme",
      "demo",
      1,
      samplePullSnapshot(),
      [],
      undefined,
      {
        classifiedAtIso: "2026-06-01T00:00:00.000Z",
        headCommitCommittedAtIso: "2026-05-31T12:00:00.000Z",
      },
    );
    expect(pullContext.classifiedAtIso).toBe("2026-06-01T00:00:00.000Z");
    expect(pullContext.headCommitCommittedAtIso).toBe("2026-05-31T12:00:00.000Z");
  });

  it("omits headCommitCommittedAtIso when temporal hydration has only classifiedAtIso", () => {
    const pullContext = mapGitHubPullAndFilesToPRContext("acme", "demo", 1, samplePullSnapshot(), [], undefined, {
      classifiedAtIso: "2026-06-01T00:00:00.000Z",
    });
    expect(pullContext.classifiedAtIso).toBe("2026-06-01T00:00:00.000Z");
    expect(pullContext.headCommitCommittedAtIso).toBeUndefined();
  });
});

describe("GitHubAdapter.buildContext", () => {
  it("delegates to the injected client then maps to PRContext", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
    try {
      const mockGithubApiClient = createMockGithubApiClient({
        listPullRequestFiles: async () => sampleFileSnapshots(),
        getRepositoryCommitCommittedAtIso: vi.fn().mockResolvedValue("2026-03-10T00:00:00.000Z"),
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
      expect(mockGithubApiClient.getRepositoryCommitCommittedAtIso).toHaveBeenCalledWith({
        repositoryOwner: "acme",
        repositoryName: "demo",
        ref: "headdeadbeef",
      });
      expect(pullContext.classifiedAtIso).toBe("2026-03-15T12:00:00.000Z");
      expect(pullContext.headCommitCommittedAtIso).toBe("2026-03-10T00:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("omits headCommitCommittedAtIso when commit timestamp lookup returns null", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
    try {
      const getRepositoryCommitCommittedAtIso = vi.fn().mockResolvedValue(null);
      const githubAdapter = new GitHubAdapter({
        githubApiClient: createMockGithubApiClient({
          listPullRequestFiles: async () => sampleFileSnapshots(),
          getRepositoryCommitCommittedAtIso,
        }),
        repositoryOwner: "acme",
        repositoryName: "demo",
        pullRequestNumber: 7,
      });
      const pullContext = await githubAdapter.buildContext();
      expect(pullContext.classifiedAtIso).toBe("2026-03-15T12:00:00.000Z");
      expect(pullContext.headCommitCommittedAtIso).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("hydrates coverage from Istanbul JSON at the PR head ref when istanbulCoverageHydration is on", async () => {
    const minimalIstanbul = JSON.stringify({
      "/x.ts": {
        path: "/x.ts",
        statementMap: {
          "0": { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } },
        },
        fnMap: {},
        branchMap: {},
        s: { "0": 1 },
        f: {},
        b: {},
      },
    });
    const getRepositoryFileTextAtRef = vi.fn().mockResolvedValue(minimalIstanbul);
    const githubAdapter = new GitHubAdapter({
      githubApiClient: createMockGithubApiClient({
        listPullRequestFiles: async () => sampleFileSnapshots(),
        getRepositoryFileTextAtRef,
      }),
      repositoryOwner: "acme",
      repositoryName: "demo",
      pullRequestNumber: 7,
      istanbulCoverageHydration: {
        repositoryRelativePath: "coverage/coverage-final.json",
        shouldHydrate: true,
      },
    });
    const pullContext = await githubAdapter.buildContext();
    expect(pullContext.coverage).toEqual({ linesCovered: 1, linesTotal: 1 });
    expect(getRepositoryFileTextAtRef).toHaveBeenCalledWith({
      repositoryOwner: "acme",
      repositoryName: "demo",
      path: "coverage/coverage-final.json",
      ref: "headdeadbeef",
    });
  });

  it("does not call getRepositoryFileTextAtRef when istanbulCoverageHydration is absent", async () => {
    const getRepositoryFileTextAtRef = vi.fn().mockResolvedValue(null);
    const mockGithubApiClient = createMockGithubApiClient({
      listPullRequestFiles: async () => sampleFileSnapshots(),
      getRepositoryFileTextAtRef,
    });
    const githubAdapter = new GitHubAdapter({
      githubApiClient: mockGithubApiClient,
      repositoryOwner: "acme",
      repositoryName: "demo",
      pullRequestNumber: 7,
    });
    await githubAdapter.buildContext();
    expect(getRepositoryFileTextAtRef).not.toHaveBeenCalled();
  });

  it("does not hydrate contextual evidence when contextualEvidenceHydration is absent", async () => {
    const mockHydrateContextualEvidence = vi.fn();
    const githubAdapter = new GitHubAdapter({
      githubApiClient: createMockGithubApiClient({
        listPullRequestFiles: async () => sampleFileSnapshots(),
      }),
      repositoryOwner: "acme",
      repositoryName: "demo",
      pullRequestNumber: 7,
      hydrateContextualEvidence: mockHydrateContextualEvidence,
    });
    const pullContext = await githubAdapter.buildContext();
    expect(mockHydrateContextualEvidence).not.toHaveBeenCalled();
    expect(pullContext.contextualEvidence).toBeUndefined();
  });

  it("hydrates contextual evidence when contextual criteria are enabled", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
    try {
      const mockHydrateContextualEvidence = vi.fn().mockReturnValue({
        contextualEvidence: {
          familiarityFindings: [
            {
              touchedFile: "src/a.ts",
              changeKind: "modified",
              authorOwnedLineCount: 0,
              totalBlameableLineCount: 10,
              shareOfCurrentContent: 0,
              authorChangedLineCount: 0,
              totalChangedLineCount: 0,
              shareOfWindowedLineChurn: 0,
              authorCommitCount: 0,
              totalFileCommitCount: 0,
              lastTouchDate: null,
              shareOfFileCommitChurn: 0,
              characterization: "none",
            },
          ],
          blastRadiusFindings: [],
          notAnalyzedForBlastRadius: [],
          limitations: [],
          enabledExtractors: [],
        },
        baseRevision: "mergebaseabc",
        authorEmails: ["alice@example.com"],
      });
      const githubAdapter = new GitHubAdapter({
        githubApiClient: createMockGithubApiClient({
          listPullRequestFiles: async () => sampleFileSnapshots(),
        }),
        repositoryOwner: "acme",
        repositoryName: "demo",
        pullRequestNumber: 7,
        contextualEvidenceHydration: {
          shouldHydrate: true,
          repositoryRoot: "/tmp/repo",
          hydrateAuthorFamiliarity: true,
          hydrateBlastRadius: false,
          authorFamiliarityOptions: { historyWindowDays: 90 },
        },
        hydrateContextualEvidence: mockHydrateContextualEvidence,
      });
      const pullContext = await githubAdapter.buildContext();
      expect(mockHydrateContextualEvidence).toHaveBeenCalledWith({
        repositoryRoot: "/tmp/repo",
        baseRef: "main",
        headRef: "headdeadbeef",
        authorLogin: "alice",
        changedPaths: ["src/a.ts", "src/b.ts"],
        classifiedAt: new Date("2026-03-15T12:00:00.000Z"),
        hydrateAuthorFamiliarity: true,
        hydrateBlastRadius: false,
        authorFamiliarityOptions: { historyWindowDays: 90 },
        blastRadiusOptions: undefined,
        dependencies: undefined,
      });
      expect(pullContext.baseRevision).toBe("mergebaseabc");
      expect(pullContext.authorEmails).toEqual(["alice@example.com"]);
      expect(pullContext.contextualEvidence?.familiarityFindings).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("passes blast-radius-only hydration flags when author familiarity is disabled", async () => {
    const mockHydrateContextualEvidence = vi.fn().mockReturnValue({
      contextualEvidence: {
        familiarityFindings: [],
        blastRadiusFindings: [
          {
            changedFile: "src/a.ts",
            directDependentCount: 0,
            directDependents: [],
            transitiveReachCount: 0,
            characterization: "isolated",
          },
        ],
        notAnalyzedForBlastRadius: [],
        limitations: ["js_ts: static imports only"],
        enabledExtractors: ["js_ts"],
      },
    });
    const githubAdapter = new GitHubAdapter({
      githubApiClient: createMockGithubApiClient({
        listPullRequestFiles: async () => sampleFileSnapshots(),
      }),
      repositoryOwner: "acme",
      repositoryName: "demo",
      pullRequestNumber: 7,
      contextualEvidenceHydration: {
        shouldHydrate: true,
        repositoryRoot: "/tmp/repo",
        hydrateAuthorFamiliarity: false,
        hydrateBlastRadius: true,
        blastRadiusOptions: { enabledExtractors: ["js_ts"] },
      },
      hydrateContextualEvidence: mockHydrateContextualEvidence,
    });
    const pullContext = await githubAdapter.buildContext();
    expect(mockHydrateContextualEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        hydrateAuthorFamiliarity: false,
        hydrateBlastRadius: true,
        blastRadiusOptions: { enabledExtractors: ["js_ts"] },
      }),
    );
    expect(pullContext.baseRevision).toBeUndefined();
    expect(pullContext.authorEmails).toBeUndefined();
    expect(pullContext.contextualEvidence?.blastRadiusFindings).toHaveLength(1);
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
    expect(mockGithubApiClient.listPullRequestIssueComments).toHaveBeenCalledWith({
      repositoryOwner: "acme",
      repositoryName: "demo",
      pullRequestNumber: 99,
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
    const listPullRequestIssueComments = vi.fn().mockResolvedValue([]);
    const githubAdapter = new GitHubAdapter({
      githubApiClient: createMockGithubApiClient({
        createMergeRiskCheckRun,
        createPullRequestComment,
        listPullRequestIssueComments,
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
    expect(listPullRequestIssueComments).not.toHaveBeenCalled();
  });

  it("skips the PR comment when comment markdown is empty or whitespace-only", async () => {
    const createPullRequestComment = vi.fn().mockResolvedValue(undefined);
    const listPullRequestIssueComments = vi.fn().mockResolvedValue([]);
    const githubAdapter = new GitHubAdapter({
      githubApiClient: createMockGithubApiClient({
        createPullRequestComment,
        listPullRequestIssueComments,
      }),
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
    expect(listPullRequestIssueComments).not.toHaveBeenCalled();
  });

  it("updates an existing Brindle PR comment when a prior comment body includes the marker", async () => {
    const createMergeRiskCheckRun = vi.fn().mockResolvedValue(undefined);
    const createPullRequestComment = vi.fn().mockResolvedValue(undefined);
    const updatePullRequestIssueComment = vi.fn().mockResolvedValue(undefined);
    const listPullRequestIssueComments = vi.fn().mockResolvedValue([
      { id: 1001, body: "Some other bot comment" },
      { id: 1002, body: `Earlier Brindle\n\n${BRINDLE_MERGE_RISK_COMMENT_MARKER}` },
    ]);
    const mockGithubApiClient = createMockGithubApiClient({
      createMergeRiskCheckRun,
      createPullRequestComment,
      listPullRequestIssueComments,
      updatePullRequestIssueComment,
    });
    const githubAdapter = new GitHubAdapter({
      githubApiClient: mockGithubApiClient,
      repositoryOwner: "acme",
      repositoryName: "demo",
      pullRequestNumber: 7,
    });
    await githubAdapter.buildContext();
    await githubAdapter.writeResult(sampleRiskReport());
    expect(updatePullRequestIssueComment).toHaveBeenCalledWith({
      repositoryOwner: "acme",
      repositoryName: "demo",
      commentId: 1002,
      body: "## Merge risk\nLow.",
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

  it("returns setting_off when enableNativePullRequestAutoMerge fails with HTTP 403 in the message", async () => {
    const enableNativePullRequestAutoMerge = vi.fn().mockRejectedValue(new Error("Request failed — 403"));
    const githubAdapter = new GitHubAdapter({
      githubApiClient: createMockGithubApiClient({ enableNativePullRequestAutoMerge }),
      repositoryOwner: "acme",
      repositoryName: "demo",
      pullRequestNumber: 1,
    });
    await githubAdapter.buildContext();
    await expect(githubAdapter.enableAutoMerge("squash")).resolves.toBe("setting_off");
  });

  it("returns setting_off when enableNativePullRequestAutoMerge fails with HTTP 401 in the message", async () => {
    const enableNativePullRequestAutoMerge = vi.fn().mockRejectedValue(new Error("401 Unauthorized"));
    const githubAdapter = new GitHubAdapter({
      githubApiClient: createMockGithubApiClient({ enableNativePullRequestAutoMerge }),
      repositoryOwner: "acme",
      repositoryName: "demo",
      pullRequestNumber: 1,
    });
    await githubAdapter.buildContext();
    await expect(githubAdapter.enableAutoMerge("merge")).resolves.toBe("setting_off");
  });

  it("rethrows other Error failures from enableNativePullRequestAutoMerge", async () => {
    const enableNativePullRequestAutoMerge = vi
      .fn()
      .mockRejectedValue(new Error("network reset without status code"));
    const githubAdapter = new GitHubAdapter({
      githubApiClient: createMockGithubApiClient({ enableNativePullRequestAutoMerge }),
      repositoryOwner: "acme",
      repositoryName: "demo",
      pullRequestNumber: 1,
    });
    await githubAdapter.buildContext();
    await expect(githubAdapter.enableAutoMerge("squash")).rejects.toThrow(/network reset/);
  });

  it("rethrows non-Error rejection values from enableNativePullRequestAutoMerge", async () => {
    const enableNativePullRequestAutoMerge = vi.fn().mockRejectedValue("not an Error instance");
    const githubAdapter = new GitHubAdapter({
      githubApiClient: createMockGithubApiClient({ enableNativePullRequestAutoMerge }),
      repositoryOwner: "acme",
      repositoryName: "demo",
      pullRequestNumber: 1,
    });
    await githubAdapter.buildContext();
    await expect(githubAdapter.enableAutoMerge("squash")).rejects.toBe("not an Error instance");
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
