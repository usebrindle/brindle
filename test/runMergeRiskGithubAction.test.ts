/**
 * End-to-end tests for the GitHub Action runner (mocked Octokit + @actions/core).
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const thisDirectory = dirname(fileURLToPath(import.meta.url));

const contextualCriteriaMergeRiskYaml =
  "thresholds:\n" +
  "  low: 30\n" +
  "  medium: 60\n" +
  "criteria:\n" +
  "  diff_size:\n" +
  "    weight: 50\n" +
  "    options:\n" +
  "      max_lines_for_cap: 100\n" +
  "  author_familiarity:\n" +
  "    weight: 25\n" +
  "    options:\n" +
  "      history_window_days: 180\n" +
  "      aggregation: max\n" +
  "      characterization_scores:\n" +
  "        high: 15\n" +
  "        moderate: 50\n" +
  "        none: 85\n" +
  "  blast_radius:\n" +
  "    weight: 25\n" +
  "    options:\n" +
  "      aggregation: max\n" +
  "      enabled_extractors:\n" +
  "        - js_ts\n" +
  "      characterization_scores:\n" +
  "        isolated: 20\n" +
  "        moderate: 55\n" +
  "        broad: 90\n" +
  "      thresholds:\n" +
  "        isolatedMax: 2\n" +
  "        moderateMax: 10\n";

const runGit = (repositoryRoot: string, gitArguments: readonly string[]): void => {
  execFileSync("git", gitArguments, { cwd: repositoryRoot, stdio: "pipe" });
};

const runGitWithEnv = (
  repositoryRoot: string,
  gitArguments: readonly string[],
  environmentVariables: Readonly<Record<string, string>>,
): void => {
  execFileSync("git", gitArguments, {
    cwd: repositoryRoot,
    stdio: "pipe",
    env: { ...process.env, ...environmentVariables },
  });
};

const writeTrackedFile = (
  repositoryRoot: string,
  repositoryRelativePath: string,
  fileText: string,
): void => {
  const absolutePath = join(repositoryRoot, repositoryRelativePath);
  mkdirSync(join(absolutePath, ".."), { recursive: true });
  writeFileSync(absolutePath, fileText, "utf8");
};

const createContextualActionFixtureRepository = (): {
  repositoryRoot: string;
  featureHeadSha: string;
} => {
  const repositoryRoot = mkdtempSync(join(tmpdir(), "brindle-action-contextual-"));
  const authorEmail = "alice@example.com";

  runGit(repositoryRoot, ["init", "-b", "main"]);
  runGit(repositoryRoot, ["config", "user.email", authorEmail]);
  runGit(repositoryRoot, ["config", "user.name", "Alice"]);

  writeTrackedFile(repositoryRoot, "src/shared/util.ts", "export const sharedValue = 1;\n");
  writeTrackedFile(
    repositoryRoot,
    "src/consumer-a.ts",
    "import { sharedValue } from './shared/util';\nexport const a = sharedValue;\n",
  );
  writeTrackedFile(
    repositoryRoot,
    "src/consumer-b.ts",
    "import { sharedValue } from './shared/util';\nexport const b = sharedValue;\n",
  );
  writeTrackedFile(
    repositoryRoot,
    "src/chain.ts",
    "import { a } from './consumer-a';\nexport const chain = a;\n",
  );

  runGit(repositoryRoot, ["add", "."]);
  runGitWithEnv(
    repositoryRoot,
    ["commit", "-m", "base graph"],
    {
      GIT_AUTHOR_NAME: "Alice",
      GIT_AUTHOR_EMAIL: authorEmail,
      GIT_COMMITTER_NAME: "Alice",
      GIT_COMMITTER_EMAIL: authorEmail,
      GIT_AUTHOR_DATE: "2026-01-01T00:00:00.000Z",
      GIT_COMMITTER_DATE: "2026-01-01T00:00:00.000Z",
    },
  );

  runGit(repositoryRoot, ["checkout", "-b", "feature"]);
  writeTrackedFile(repositoryRoot, "src/shared/util.ts", "export const sharedValue = 2;\n");
  writeTrackedFile(repositoryRoot, "src/new.ts", "export const fresh = 1;\n");
  runGit(repositoryRoot, ["add", "."]);
  runGitWithEnv(
    repositoryRoot,
    ["commit", "-m", "pr changes"],
    {
      GIT_AUTHOR_NAME: "Alice",
      GIT_AUTHOR_EMAIL: authorEmail,
      GIT_COMMITTER_NAME: "Alice",
      GIT_COMMITTER_EMAIL: authorEmail,
      GIT_AUTHOR_DATE: "2026-06-01T00:00:00.000Z",
      GIT_COMMITTER_DATE: "2026-06-01T00:00:00.000Z",
    },
  );

  const featureHeadSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();

  return { repositoryRoot, featureHeadSha };
};

const actionTestHarness = vi.hoisted(() => {
  const mergeRiskYaml =
    "thresholds:\n  low: 30\n  medium: 60\ncriteria:\n  diff_size:\n    weight: 100\n    options:\n      max_lines_for_cap: 100\n";

  const mergeRiskContentPayload = {
    type: "file" as const,
    encoding: "base64" as const,
    content: Buffer.from(mergeRiskYaml, "utf8").toString("base64"),
  };

  const reposGetContent = vi.fn(async (args: { path: string }) => {
    if (args.path === ".merge-risk.yml") {
      return { data: mergeRiskContentPayload };
    }
    const notFound = new Error("Not Found");
    (notFound as { status?: number }).status = 404;
    throw notFound;
  });

  const reposGetCommit = vi.fn(async () => ({
    data: {
      commit: { committer: { date: "2026-01-14T00:00:00Z" } },
    },
  }));

  const pullsGet = vi.fn(async () => ({
    data: {
      node_id: "nid_test_pr",
      head: { sha: "abc123head" },
      base: { ref: "main" },
      user: { login: "alice" },
      title: "Test PR",
      body: "",
      labels: [],
      created_at: "2026-01-15T12:00:00Z",
    },
  }));

  const checksCreate = vi.fn(async () => ({ data: {} }));
  const issuesCreateComment = vi.fn(async () => ({ data: {} }));

  const paginate = vi.fn().mockResolvedValue([
    { filename: "README.md", status: "modified", additions: 4, deletions: 1 },
  ]);

  const OctokitMock = vi.fn(function OctokitMockConstructor() {
    return {
      rest: {
        repos: {
          getContent: reposGetContent,
          getCommit: reposGetCommit,
        },
        pulls: {
          get: pullsGet,
          listFiles: vi.fn(),
        },
        checks: { create: checksCreate },
        issues: { createComment: issuesCreateComment },
      },
      paginate,
    };
  });

  const setOutput = vi.fn();
  const info = vi.fn();
  const getInput = vi.fn();
  const getBooleanInput = vi.fn();

  return {
    reposGetContent,
    reposGetCommit,
    pullsGet,
    checksCreate,
    issuesCreateComment,
    paginate,
    OctokitMock,
    setOutput,
    info,
    getInput,
    getBooleanInput,
  };
});

vi.mock("@octokit/rest", () => ({
  Octokit: actionTestHarness.OctokitMock,
}));

vi.mock("@actions/core", () => ({
  getInput: (name: string) => actionTestHarness.getInput(name),
  getBooleanInput: (name: string) => actionTestHarness.getBooleanInput(name),
  info: (...args: unknown[]) => actionTestHarness.info(...args),
  setOutput: (name: string, value: string) => actionTestHarness.setOutput(name, value),
}));

const { mergeRiskGithubActionOutputKeys, runMergeRiskGithubAction } = await import(
  "../extensions/github-action/runMergeRiskGithubAction.js"
);

describe("runMergeRiskGithubAction", () => {
  let eventJsonPath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const eventsDir = await mkdtemp(join(tmpdir(), "brindle-github-action-event-"));
    eventJsonPath = join(eventsDir, "event.json");
    const fixturePath = join(thisDirectory, "fixtures", "github-action", "pull-request-opened.json");
    const eventBody = await readFile(fixturePath, "utf8");
    await writeFile(eventJsonPath, eventBody, "utf8");

    vi.stubEnv("GITHUB_REPOSITORY", "acme/widget");
    vi.stubEnv("GITHUB_TOKEN", "test-github-token");
    vi.stubEnv("GITHUB_EVENT_PATH", eventJsonPath);

    actionTestHarness.getInput.mockImplementation((name: string) => {
      if (name === "github_token") {
        return "";
      }
      if (name === "merge_risk_file_path") {
        return "";
      }
      if (name === "coverage_report_path") {
        return "";
      }
      return "";
    });

    actionTestHarness.getBooleanInput.mockImplementation((name: string) => {
      if (name === "skip_when_merge_risk_missing_on_base") {
        return false;
      }
      if (name === "informational_check_conclusion") {
        return true;
      }
      if (name === "fail_on_high") {
        return false;
      }
      if (name === "post_risk_summary_comment") {
        return true;
      }
      return false;
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sets GitHub Actions outputs from score and risk report after a full mocked run", async () => {
    await runMergeRiskGithubAction();

    expect(actionTestHarness.checksCreate).toHaveBeenCalledTimes(1);
    expect(actionTestHarness.issuesCreateComment).toHaveBeenCalledTimes(1);

    const outputByName = Object.fromEntries(
      actionTestHarness.setOutput.mock.calls.map(([outputName, outputValue]) => [outputName, outputValue]),
    );

    expect(outputByName[mergeRiskGithubActionOutputKeys.riskTier]).toBe("LOW");
    expect(outputByName[mergeRiskGithubActionOutputKeys.riskScore]).toBe("5");
    expect(outputByName[mergeRiskGithubActionOutputKeys.autoMergeOutcome]).toBe("skipped");

    const parsedBreakdown = JSON.parse(
      outputByName[mergeRiskGithubActionOutputKeys.criteriaBreakdown] as string,
    ) as { name: string; weighted: number }[];
    expect(parsedBreakdown).toHaveLength(1);
    expect(parsedBreakdown[0]!.name).toBe("Diff size");
    expect(parsedBreakdown[0]!.weighted).toBe(5);
  });

  it("skips the pull request comment when post_risk_summary_comment is false", async () => {
    actionTestHarness.getBooleanInput.mockImplementation((name: string) => {
      if (name === "post_risk_summary_comment") {
        return false;
      }
      if (name === "skip_when_merge_risk_missing_on_base") {
        return false;
      }
      if (name === "informational_check_conclusion") {
        return true;
      }
      if (name === "fail_on_high") {
        return false;
      }
      return false;
    });

    await runMergeRiskGithubAction();

    expect(actionTestHarness.checksCreate).toHaveBeenCalledTimes(1);
    expect(actionTestHarness.issuesCreateComment).not.toHaveBeenCalled();
  });

  describe("with contextual criteria enabled", () => {
    let repositoryRoot: string;

    beforeEach(() => {
      const fixtureRepository = createContextualActionFixtureRepository();
      repositoryRoot = fixtureRepository.repositoryRoot;

      vi.stubEnv("GITHUB_WORKSPACE", repositoryRoot);

      actionTestHarness.reposGetContent.mockImplementation(async (args: { path: string }) => {
        if (args.path === ".merge-risk.yml") {
          return {
            data: {
              type: "file" as const,
              encoding: "base64" as const,
              content: Buffer.from(contextualCriteriaMergeRiskYaml, "utf8").toString("base64"),
            },
          };
        }
        const notFound = new Error("Not Found");
        (notFound as { status?: number }).status = 404;
        throw notFound;
      });

      actionTestHarness.pullsGet.mockResolvedValue({
        data: {
          node_id: "nid_test_pr",
          head: { sha: fixtureRepository.featureHeadSha },
          base: { ref: "main" },
          user: { login: "alice" },
          title: "Contextual criteria PR",
          body: "",
          labels: [],
          created_at: "2026-06-15T12:00:00Z",
        },
      });

      actionTestHarness.paginate.mockResolvedValue([
        { filename: "src/shared/util.ts", status: "modified", additions: 1, deletions: 1 },
        { filename: "src/new.ts", status: "added", additions: 1, deletions: 0 },
      ]);
    });

    afterEach(() => {
      rmSync(repositoryRoot, { recursive: true, force: true });
    });

    it("hydrates contextual evidence and includes both criteria in breakdown and PR comment", async () => {
      await runMergeRiskGithubAction();

      expect(actionTestHarness.checksCreate).toHaveBeenCalledTimes(1);
      expect(actionTestHarness.issuesCreateComment).toHaveBeenCalledTimes(1);

      const outputByName = Object.fromEntries(
        actionTestHarness.setOutput.mock.calls.map(([outputName, outputValue]) => [outputName, outputValue]),
      );

      const parsedBreakdown = JSON.parse(
        outputByName[mergeRiskGithubActionOutputKeys.criteriaBreakdown] as string,
      ) as { name: string; weighted: number; selfDisabled?: boolean }[];

      const breakdownNames = parsedBreakdown.map((row) => row.name);
      expect(breakdownNames).toContain("Author familiarity");
      expect(breakdownNames).toContain("Blast radius");
      expect(parsedBreakdown.find((row) => row.name === "Author familiarity")?.selfDisabled).not.toBe(true);
      expect(parsedBreakdown.find((row) => row.name === "Blast radius")?.selfDisabled).not.toBe(true);

      const commentCreateCall = actionTestHarness.issuesCreateComment.mock.calls.at(0)?.at(0) as
        | { body?: string }
        | undefined;
      const commentMarkdown = commentCreateCall?.body ?? "";
      expect(commentMarkdown).toContain("<summary>Contextual evidence</summary>");
      expect(commentMarkdown).toContain("### Familiarity");
      expect(commentMarkdown).toContain("### Blast radius");
      expect(commentMarkdown).toContain("src/new.ts");
      expect(commentMarkdown).toContain("src/shared/util.ts");
    });
  });
});
