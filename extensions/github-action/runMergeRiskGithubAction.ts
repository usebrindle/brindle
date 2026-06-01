/**
 * Loads merge-risk config from the PR base ref (Contents API), scores, then writes check + comment.
 *
 * @see docs/adrs/0001-no-pr-head-execution.md
 */
import { getBooleanInput, getInput, info } from "@actions/core";
import { readFile } from "node:fs/promises";

import { Octokit } from "@octokit/rest";

import { GitHubAdapter, createOctokitGithubApiClient } from "../../adapters/index.js";
import {
  buildRiskReport,
  loadScoringConfigFromMergeRiskYaml,
  MergeRiskConfigError,
  score,
} from "../../core/index.js";
import type { BuildRiskReportOptions } from "../../core/report.types.js";

const defaultMergeRiskReportPolicy = (): BuildRiskReportOptions => ({
  failOnHigh: false,
  /** Native auto-merge wiring is slice 09; keep policy off in the Action until then. */
  autoMergePolicy: { enabled: false, maxEligibleTier: "LOW" },
  nativeAutoMergeSupported: true,
});

const parseGithubRepositorySlug = (
  githubRepositoryEnvironmentValue: string | undefined,
): { repositoryOwner: string; repositoryName: string } => {
  if (githubRepositoryEnvironmentValue === undefined || githubRepositoryEnvironmentValue.trim() === "") {
    throw new Error("GITHUB_REPOSITORY is missing; this action must run in a GitHub Actions workflow.");
  }
  const [repositoryOwner, repositoryName] = githubRepositoryEnvironmentValue.split("/");
  if (
    repositoryOwner === undefined ||
    repositoryName === undefined ||
    repositoryOwner === "" ||
    repositoryName === ""
  ) {
    throw new Error(
      `GITHUB_REPOSITORY must be owner/repo, got "${githubRepositoryEnvironmentValue}".`,
    );
  }
  return { repositoryOwner, repositoryName };
};

const readGithubEventPayloadFromRunner = async (): Promise<unknown> => {
  const githubEventPath = process.env.GITHUB_EVENT_PATH;
  if (githubEventPath === undefined || githubEventPath === "") {
    throw new Error("GITHUB_EVENT_PATH is missing.");
  }
  const rawJson = await readFile(githubEventPath, "utf8");
  return JSON.parse(rawJson) as unknown;
};

const readPullRequestNumberAndBaseRefFromEvent = (
  githubEventPayload: unknown,
): { pullRequestNumber: number; baseRefName: string } => {
  if (typeof githubEventPayload !== "object" || githubEventPayload === null) {
    throw new Error("GitHub event payload is not a JSON object.");
  }
  const recordPayload = githubEventPayload as Record<string, unknown>;
  const pullRequestRecord = recordPayload.pull_request;
  if (typeof pullRequestRecord !== "object" || pullRequestRecord === null) {
    throw new Error("This action only supports pull_request events (missing pull_request).");
  }
  const pullRequestObject = pullRequestRecord as Record<string, unknown>;
  const pullRequestNumber = pullRequestObject.number;
  const baseRecord = pullRequestObject.base;
  if (typeof baseRecord !== "object" || baseRecord === null) {
    throw new Error("pull_request.base is missing from the event payload.");
  }
  const baseObject = baseRecord as Record<string, unknown>;
  const baseRefName = baseObject.ref;
  if (typeof pullRequestNumber !== "number" || typeof baseRefName !== "string" || baseRefName === "") {
    throw new Error("pull_request.number or pull_request.base.ref is invalid.");
  }
  return { pullRequestNumber, baseRefName };
};

const decodeGithubContentsApiFileBody = (
  contentsApiResponse: unknown,
  requestedFilePath: string,
): string => {
  if (Array.isArray(contentsApiResponse)) {
    throw new Error(`${requestedFilePath} on the base ref is a directory, not a file.`);
  }
  if (typeof contentsApiResponse !== "object" || contentsApiResponse === null) {
    throw new Error(`Unexpected response when reading ${requestedFilePath} from the base ref.`);
  }
  const fileRecord = contentsApiResponse as Record<string, unknown>;
  if (fileRecord.type !== "file") {
    throw new Error(`${requestedFilePath} on the base ref is not a file (type=${String(fileRecord.type)}).`);
  }
  const encoding = fileRecord.encoding;
  const base64Content = fileRecord.content;
  if (encoding !== "base64" || typeof base64Content !== "string") {
    throw new Error(`${requestedFilePath} could not be read as base64-encoded file content.`);
  }
  const normalizedBase64 = base64Content.replace(/\s/g, "");
  return Buffer.from(normalizedBase64, "base64").toString("utf8");
};

const isGithubContentsApiNotFoundError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const maybeStatus = (error as { status?: unknown }).status;
  return maybeStatus === 404;
};

const fetchMergeRiskYamlTextFromGithubBaseRef = async (options: {
  octokit: Octokit;
  repositoryOwner: string;
  repositoryName: string;
  baseRefName: string;
  mergeRiskFilePath: string;
  /** When true, a missing file on the base ref returns `null` instead of throwing (ADR 0001 still holds: nothing is read from the PR head). */
  skipWhenMergeRiskFileMissingOnBase: boolean;
}): Promise<string | null> => {
  const {
    octokit,
    repositoryOwner,
    repositoryName,
    baseRefName,
    mergeRiskFilePath,
    skipWhenMergeRiskFileMissingOnBase,
  } = options;
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: repositoryOwner,
      repo: repositoryName,
      path: mergeRiskFilePath,
      ref: baseRefName,
    });
    return decodeGithubContentsApiFileBody(data, mergeRiskFilePath);
  } catch (cause: unknown) {
    if (skipWhenMergeRiskFileMissingOnBase && isGithubContentsApiNotFoundError(cause)) {
      return null;
    }
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `Could not load ${mergeRiskFilePath} from base ref "${baseRefName}" (${message}). ` +
        "Add the file on the default branch / base ref (see ADR 0001). " +
        "If this pull request only adds the file, set input skip_when_merge_risk_missing_on_base to true until the base branch has it, or merge the config in an earlier change.",
      { cause },
    );
  }
};

const resolveGithubAuthTokenFromActionInputs = (): string => {
  const fromInput = getInput("github_token");
  if (fromInput !== "") {
    return fromInput;
  }
  const fromEnv = process.env.GITHUB_TOKEN;
  if (fromEnv !== undefined && fromEnv !== "") {
    return fromEnv;
  }
  throw new Error("github_token input or GITHUB_TOKEN environment variable is required.");
};

/**
 * End-to-end Brindle run for `pull_request` workflows.
 */
export const runMergeRiskGithubAction = async (): Promise<void> => {
  const githubToken = resolveGithubAuthTokenFromActionInputs();
  const mergeRiskFilePath =
    getInput("merge_risk_file_path") === "" ? ".merge-risk.yml" : getInput("merge_risk_file_path");
  const skipWhenMergeRiskFileMissingOnBase = getBooleanInput("skip_when_merge_risk_missing_on_base");

  const { repositoryOwner, repositoryName } = parseGithubRepositorySlug(process.env.GITHUB_REPOSITORY);
  const githubEventPayload = await readGithubEventPayloadFromRunner();
  const { pullRequestNumber, baseRefName } = readPullRequestNumberAndBaseRefFromEvent(githubEventPayload);

  const octokit = new Octokit({ auth: githubToken });

  const mergeRiskYamlText = await fetchMergeRiskYamlTextFromGithubBaseRef({
    octokit,
    repositoryOwner,
    repositoryName,
    baseRefName,
    mergeRiskFilePath,
    skipWhenMergeRiskFileMissingOnBase,
  });

  if (mergeRiskYamlText === null) {
    info(
      `Brindle skipped: "${mergeRiskFilePath}" is not on base ref "${baseRefName}" yet (Contents API 404). ` +
        "Merge that file to the default branch to enable scoring; this run exited successfully because skip_when_merge_risk_missing_on_base is true.",
    );
    return;
  }

  let scoringConfig;
  try {
    scoringConfig = loadScoringConfigFromMergeRiskYaml(mergeRiskYamlText);
  } catch (cause: unknown) {
    if (cause instanceof MergeRiskConfigError) {
      throw new Error(`Invalid merge-risk config: ${cause.message}`, { cause });
    }
    throw cause;
  }

  const githubApiClient = createOctokitGithubApiClient(octokit);

  const githubAdapter = new GitHubAdapter({
    githubApiClient,
    repositoryOwner,
    repositoryName,
    pullRequestNumber,
  });

  const pullRequestContext = await githubAdapter.buildContext();
  const scoreResult = score(pullRequestContext, scoringConfig);
  const riskReport = buildRiskReport(scoreResult, defaultMergeRiskReportPolicy());
  await githubAdapter.writeResult(riskReport);

  info(
    `Brindle merge risk finished (tier=${scoreResult.tier}, score=${String(scoreResult.score)}, check=${riskReport.checkConclusion}).`,
  );
};
