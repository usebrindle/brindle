/**
 * Builds a platform-neutral {@link RiskReport} from a {@link ScoreResult} plus policy flags.
 * Performs no I/O; adapters render the report to comments, checks, and auto-merge APIs.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 * @see docs/adrs/0002-native-auto-merge.md
 * @see docs/adrs/0003-check-runs-over-commit-statuses.md
 */
import type { AutoMergeOutcome, RiskReport, ScoreResult } from "./types.js";
import type { BuildRiskReportOptions } from "./report.types.js";

type RiskTier = ScoreResult["tier"];

const tierRiskIndex = (tier: RiskTier): 0 | 1 | 2 => {
  if (tier === "LOW") return 0;
  if (tier === "MEDIUM") return 1;
  return 2;
};

/**
 * Maps risk tier and `fail-on-high` to a Check Runs–style conclusion (ADR 0003).
 *
 * @param riskTier - Final tier from scoring.
 * @param failOnHigh - When `true`, HIGH becomes `failure` instead of `action_required`.
 */
export const checkConclusionForTier = (
  riskTier: RiskTier,
  failOnHigh: boolean,
): RiskReport["checkConclusion"] => {
  if (riskTier === "LOW") return "success";
  if (riskTier === "MEDIUM") return "neutral";
  return failOnHigh ? "failure" : "action_required";
};

const autoMergeOutcomeFromPolicy = (
  scoreResult: ScoreResult,
  reportOptions: BuildRiskReportOptions,
): AutoMergeOutcome => {
  if (!reportOptions.autoMergePolicy.enabled) return "skipped";
  if (!reportOptions.nativeAutoMergeSupported) return "unsupported";
  const resultTierIndex = tierRiskIndex(scoreResult.tier);
  const maxEligibleTierIndex = tierRiskIndex(reportOptions.autoMergePolicy.maxEligibleTier);
  if (resultTierIndex > maxEligibleTierIndex) return "not_eligible";
  return "eligible";
};

const escapeMarkdownTableCell = (rawText: string): string =>
  rawText.replaceAll("|", "\\|").replaceAll("\n", " ").trim();

const formatNumberForDisplay = (numericValue: number): string => {
  const roundedToTenth = Math.round(numericValue * 10) / 10;
  return Number.isInteger(roundedToTenth) ? String(roundedToTenth) : roundedToTenth.toFixed(1);
};

/**
 * Markdown summary suitable for an optional change-request comment (LLD reporting flow).
 *
 * @param scoreResult - Outcome from {@link score}.
 */
export const buildMergeRiskCommentMarkdown = (scoreResult: ScoreResult): string => {
  const headerLines = [
    "## Merge risk",
    "",
    `**Tier:** ${scoreResult.tier}`,
    `**Score:** ${formatNumberForDisplay(scoreResult.score)}`,
    "",
  ];

  const mutatorLine =
    scoreResult.mutatorsApplied.length === 0
      ? ""
      : `_Mutators applied:_ ${scoreResult.mutatorsApplied.map(escapeMarkdownTableCell).join(", ")}`;

  const disabledLine =
    scoreResult.disabledCriteria.length === 0
      ? ""
      : `_Criteria disabled (config or self-disable):_ ${scoreResult.disabledCriteria.map(escapeMarkdownTableCell).join(", ")}`;

  const tableHeader = [
    "",
    "### Criteria breakdown",
    "",
    "| Criterion | Raw | Weight % | Weighted | Notes |",
    "| --- | ---: | ---: | ---: | --- |",
  ];

  const tableBody = scoreResult.breakdown.map((breakdownRow) => {
    const name = escapeMarkdownTableCell(breakdownRow.name);
    const justification = escapeMarkdownTableCell(breakdownRow.justification);
    return `| ${name} | ${formatNumberForDisplay(breakdownRow.score)} | ${formatNumberForDisplay(breakdownRow.weight)} | ${formatNumberForDisplay(breakdownRow.weighted)} | ${justification} |`;
  });

  const trailing = [mutatorLine, disabledLine].filter((line) => line.length > 0).join("\n\n");

  const pieces = [...headerLines, ...tableHeader, ...tableBody];
  if (trailing.length > 0) {
    pieces.push("", trailing);
  }
  return `${pieces.join("\n")}\n`;
};

/**
 * Assembles a {@link RiskReport} for adapters to render.
 *
 * @param scoreResult - Deterministic output from {@link score}.
 * @param reportOptions - Check and auto-merge policy from validated config + platform capabilities.
 * @returns Neutral report payload including markdown and outcome metadata.
 */
export const buildRiskReport = (
  scoreResult: ScoreResult,
  reportOptions: BuildRiskReportOptions,
): RiskReport => ({
  result: scoreResult,
  commentMarkdown: buildMergeRiskCommentMarkdown(scoreResult),
  checkConclusion: checkConclusionForTier(scoreResult.tier, reportOptions.failOnHigh),
  autoMergeOutcome: autoMergeOutcomeFromPolicy(scoreResult, reportOptions),
});
