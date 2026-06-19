/**
 * Loads merge-risk config from the PR base ref (Contents API), scores, then writes check + comment.
 *
 * @see docs/adrs/0001-no-pr-head-execution.md
 * @see docs/adrs/0002-native-auto-merge.md
 */
import { getBooleanInput, getInput, info, setOutput } from "@actions/core";
import { readFile } from "node:fs/promises";

import { Octokit } from "@octokit/rest";

import { decodeGithubRepositoryContentFile } from "../../adapters/github/decodeGithubRepositoryContentFile.js";
import { GitHubAdapter, createOctokitGithubApiClient } from "../../adapters/index.js";
import {
  buildRiskReport,
  loadMergeRiskRepositoryYaml,
  MergeRiskConfigError,
  score,
} from "../../core/index.js";
import { buildContextualEvidencePayload } from "../../core/contextual/index.js";
import { loadTrustedPlugins } from "../../core/plugins/loadTrustedPlugins.js";
import type { TrustedPluginsScoringArtifacts } from "../../core/plugins/loadTrustedPlugins.js";
import { validateTrustedPluginsPathsStayUnderDirectory } from "../../core/plugins/trustedPluginPaths.js";
import type { BuildRiskReportOptions } from "../../core/report.types.js";
import type {
  MergeRiskAutoMergeConfig,
  RiskReport,
  ScoreResult,
  TrustedPluginsConfiguration,
} from "../../core/types.js";
import type { AuthorFamiliarityCriterionOptions } from "../../core/criteria/authorFamiliarity.types.js";
import type { BlastRadiusCriterionOptions } from "../../core/criteria/blastRadius.types.js";

/**
 * GitHub Actions job output names (must match `outputs` in {@link ./action.yml}).
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 */
export const mergeRiskGithubActionOutputKeys = {
  riskTier: "risk_tier",
  riskScore: "risk_score",
  criteriaBreakdown: "criteria_breakdown",
  autoMergeOutcome: "auto_merge_outcome",
} as const;

const writeMergeRiskGithubActionJobOutputs = (scoreResult: ScoreResult, riskReport: RiskReport): void => {
  setOutput(mergeRiskGithubActionOutputKeys.riskTier, scoreResult.tier);
  setOutput(mergeRiskGithubActionOutputKeys.riskScore, String(scoreResult.score));
  setOutput(mergeRiskGithubActionOutputKeys.criteriaBreakdown, JSON.stringify(scoreResult.breakdown));
  setOutput(mergeRiskGithubActionOutputKeys.autoMergeOutcome, riskReport.autoMergeOutcome);
};

const buildMergeRiskReportOptionsFromGithubActionInputs = (
  autoMerge: MergeRiskAutoMergeConfig | undefined,
  reportPolicyFromInputs: { informationalCheckConclusion: boolean; failOnHigh: boolean },
): BuildRiskReportOptions => ({
  failOnHigh: reportPolicyFromInputs.failOnHigh,
  informationalCheckConclusion: reportPolicyFromInputs.informationalCheckConclusion,
  autoMergePolicy:
    autoMerge === undefined
      ? { enabled: false, maxEligibleTier: "LOW" }
      : { enabled: true, maxEligibleTier: autoMerge.maxEligibleTier },
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
    return decodeGithubRepositoryContentFile(data, mergeRiskFilePath);
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

const requireValidatedTrustedPluginNormalizedPaths = (
  trustedPlugins: TrustedPluginsConfiguration,
): string[] => {
  const pathValidation = validateTrustedPluginsPathsStayUnderDirectory(trustedPlugins);
  if (!pathValidation.ok) {
    throw new Error(`Invalid trusted_plugins: ${pathValidation.message}`);
  }
  return pathValidation.normalizedPluginPaths;
};

/**
 * Fetches one repository-relative text file at the base ref via Contents API + decode (ADR 0001).
 */
const fetchDecodedTextFileFromGithubRepositoryAtRef = async (options: {
  octokit: Octokit;
  repositoryOwner: string;
  repositoryName: string;
  baseRefName: string;
  repositoryRelativePath: string;
}): Promise<string> => {
  const { octokit, repositoryOwner, repositoryName, baseRefName, repositoryRelativePath } = options;
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: repositoryOwner,
      repo: repositoryName,
      path: repositoryRelativePath,
      ref: baseRefName,
    });
    return decodeGithubRepositoryContentFile(data, repositoryRelativePath);
  } catch (cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `Could not load trusted plugin file ${JSON.stringify(repositoryRelativePath)} from base ref "${baseRefName}" (${message}). ` +
        "Ensure the file exists on the base branch (see ADR 0001).",
      { cause },
    );
  }
};

const buildTrustedPluginYamlTextByNormalizedPathMap = async (options: {
  octokit: Octokit;
  repositoryOwner: string;
  repositoryName: string;
  baseRefName: string;
  normalizedPluginPaths: readonly string[];
}): Promise<Map<string, string>> => {
  const { octokit, repositoryOwner, repositoryName, baseRefName, normalizedPluginPaths } = options;
  const entries = await Promise.all(
    normalizedPluginPaths.map(async (normalizedPluginPath) => {
      const yamlText = await fetchDecodedTextFileFromGithubRepositoryAtRef({
        octokit,
        repositoryOwner,
        repositoryName,
        baseRefName,
        repositoryRelativePath: normalizedPluginPath,
      });
      return [normalizedPluginPath, yamlText] as const;
    }),
  );
  return new Map(entries);
};

const trustedPluginsScoringArtifactsFromFetchedYamlBodies = (options: {
  trustedPlugins: TrustedPluginsConfiguration;
  pluginFileContentsByNormalizedPath: ReadonlyMap<string, string>;
}): TrustedPluginsScoringArtifacts => {
  const loadOutcome = loadTrustedPlugins(options);
  if (!loadOutcome.ok) {
    throw new Error(`Trusted plugin load failed: ${loadOutcome.message}`);
  }
  return {
    criteria: loadOutcome.criteria,
    criterionConfigurations: loadOutcome.criterionConfigurations,
  };
};

/**
 * Loads trusted plugin YAML from the PR base ref (Contents API) and resolves {@link TrustedPluginsScoringArtifacts}
 * for {@link score}. Throws when path validation fails, a file is missing on the base ref, or plugin YAML is invalid.
 *
 * @see docs/adrs/0001-no-pr-head-execution.md
 */
const loadTrustedPluginsScoringArtifactsFromGithubBaseRef = async (options: {
  octokit: Octokit;
  repositoryOwner: string;
  repositoryName: string;
  baseRefName: string;
  trustedPlugins: TrustedPluginsConfiguration;
}): Promise<TrustedPluginsScoringArtifacts> => {
  const { octokit, repositoryOwner, repositoryName, baseRefName, trustedPlugins } = options;
  const normalizedPluginPaths = requireValidatedTrustedPluginNormalizedPaths(trustedPlugins);
  const pluginFileContentsByNormalizedPath = await buildTrustedPluginYamlTextByNormalizedPathMap({
    octokit,
    repositoryOwner,
    repositoryName,
    baseRefName,
    normalizedPluginPaths,
  });
  return trustedPluginsScoringArtifactsFromFetchedYamlBodies({
    trustedPlugins,
    pluginFileContentsByNormalizedPath,
  });
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

  let mergeRiskRepositoryYaml;
  try {
    mergeRiskRepositoryYaml = loadMergeRiskRepositoryYaml(mergeRiskYamlText);
  } catch (cause: unknown) {
    if (cause instanceof MergeRiskConfigError) {
      throw new Error(`Invalid merge-risk config: ${cause.message}`, { cause });
    }
    throw cause;
  }

  const { scoringConfig, autoMerge } = mergeRiskRepositoryYaml;

  const trustedPluginsArtifacts: TrustedPluginsScoringArtifacts | undefined =
    scoringConfig.trusted_plugins === undefined
      ? undefined
      : await loadTrustedPluginsScoringArtifactsFromGithubBaseRef({
          octokit,
          repositoryOwner,
          repositoryName,
          baseRefName,
          trustedPlugins: scoringConfig.trusted_plugins,
        });

  const informationalCheckConclusion = getBooleanInput("informational_check_conclusion");
  const failOnHigh = getBooleanInput("fail_on_high");
  const postRiskSummaryComment = getBooleanInput("post_risk_summary_comment");

  const coverageReportPath = getInput("coverage_report_path").trim();
  const testCoverageCriterionConfig = scoringConfig.criteria.test_coverage;
  const shouldHydrateIstanbulCoverage =
    coverageReportPath !== "" &&
    testCoverageCriterionConfig !== undefined &&
    testCoverageCriterionConfig.enabled !== false;

  const authorFamiliarityCriterionConfig = scoringConfig.criteria.author_familiarity;
  const blastRadiusCriterionConfig = scoringConfig.criteria.blast_radius;
  const authorFamiliarityOptions =
    authorFamiliarityCriterionConfig?.options as AuthorFamiliarityCriterionOptions | undefined;
  const blastRadiusOptions =
    blastRadiusCriterionConfig?.options as BlastRadiusCriterionOptions | undefined;
  const shouldHydrateAuthorFamiliarity =
    authorFamiliarityCriterionConfig !== undefined &&
    authorFamiliarityCriterionConfig.enabled !== false;
  const shouldHydrateBlastRadius =
    blastRadiusCriterionConfig !== undefined &&
    blastRadiusCriterionConfig.enabled !== false;
  const shouldHydrateContextualEvidence =
    shouldHydrateAuthorFamiliarity || shouldHydrateBlastRadius;

  const githubWorkspacePath = process.env.GITHUB_WORKSPACE?.trim() ?? "";
  if (shouldHydrateContextualEvidence && githubWorkspacePath === "") {
    throw new Error(
      "Contextual criteria (author_familiarity and/or blast_radius) require a checked-out repository. " +
        "Add actions/checkout@v4 with ref set to github.event.pull_request.head.sha before this action " +
        "(see docs/guides/contextual-evidence.md).",
    );
  }

  const githubApiClient = createOctokitGithubApiClient(octokit);

  const githubAdapter = new GitHubAdapter({
    githubApiClient,
    repositoryOwner,
    repositoryName,
    pullRequestNumber,
    postRiskSummaryComment,
    istanbulCoverageHydration: shouldHydrateIstanbulCoverage
      ? { repositoryRelativePath: coverageReportPath, shouldHydrate: true }
      : undefined,
    contextualEvidenceHydration: shouldHydrateContextualEvidence
      ? {
          shouldHydrate: true,
          repositoryRoot: githubWorkspacePath,
          hydrateAuthorFamiliarity: shouldHydrateAuthorFamiliarity,
          hydrateBlastRadius: shouldHydrateBlastRadius,
          ...(shouldHydrateAuthorFamiliarity
            ? {
                authorFamiliarityOptions: {
                  historyWindowDays: authorFamiliarityOptions?.history_window_days,
                  authorEmails: authorFamiliarityOptions?.author_emails,
                },
              }
            : {}),
          ...(shouldHydrateBlastRadius
            ? {
                blastRadiusOptions: {
                  enabledExtractors: blastRadiusOptions?.enabled_extractors,
                  thresholds: blastRadiusOptions?.thresholds,
                },
              }
            : {}),
        }
      : undefined,
  });

  const pullRequestContext = await githubAdapter.buildContext();
  const scoreResult = score(pullRequestContext, scoringConfig, trustedPluginsArtifacts);
  const contextualEvidencePayload = shouldHydrateContextualEvidence
    ? buildContextualEvidencePayload(pullRequestContext, {
        historyWindowDays: authorFamiliarityOptions?.history_window_days,
      })
    : undefined;
  const riskReport = buildRiskReport(
    scoreResult,
    {
      ...buildMergeRiskReportOptionsFromGithubActionInputs(autoMerge, {
        informationalCheckConclusion,
        failOnHigh,
      }),
      ...(contextualEvidencePayload === null || contextualEvidencePayload === undefined
        ? {}
        : { contextualEvidence: contextualEvidencePayload }),
    },
  );
  writeMergeRiskGithubActionJobOutputs(scoreResult, riskReport);
  await githubAdapter.writeResult(riskReport);

  if (riskReport.autoMergeOutcome === "eligible") {
    const mergeMethod = autoMerge?.method ?? "squash";
    const nativeAutoMergeOutcome = await githubAdapter.enableAutoMerge(mergeMethod);
    info(`Brindle native auto-merge outcome: ${nativeAutoMergeOutcome}.`);
  }

  info(
    `Brindle merge risk finished (tier=${scoreResult.tier}, score=${String(scoreResult.score)}, check=${riskReport.checkConclusion}).`,
  );
};
