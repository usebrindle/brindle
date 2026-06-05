/**
 * End-to-end tests for the GitHub Action runner (mocked Octokit + @actions/core).
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 */
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const thisDirectory = dirname(fileURLToPath(import.meta.url));

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
});
