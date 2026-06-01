/**
 * Builds a platform-neutral {@link RiskReport} from a {@link ScoreResult} plus policy flags.
 * Performs no I/O; adapters render the report to comments, checks, and auto-merge APIs.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 * @see docs/adrs/0002-native-auto-merge.md
 * @see docs/adrs/0003-check-runs-over-commit-statuses.md
 */
import type {
  AutoMergeOutcome,
  CriterionBreakdown,
  RiskReport,
  ScoreResult,
} from "./types.js";
import type { BuildRiskReportOptions } from "./report.types.js";

type RiskTier = ScoreResult["tier"];

const numericRiskRankForTier = (riskTier: RiskTier): 0 | 1 | 2 => {
  if (riskTier === "LOW") return 0;
  if (riskTier === "MEDIUM") return 1;
  return 2;
};

const isRiskTierAtOrBelowMaxEligible = (
  resultTier: RiskTier,
  maxEligibleTier: RiskTier,
): boolean =>
  numericRiskRankForTier(resultTier) <= numericRiskRankForTier(maxEligibleTier);

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

const autoMergeOutcomeFromReportPolicy = (
  scoreResult: ScoreResult,
  reportOptions: BuildRiskReportOptions,
): AutoMergeOutcome => {
  if (!reportOptions.autoMergePolicy.enabled) return "skipped";
  if (!reportOptions.nativeAutoMergeSupported) return "unsupported";
  if (
    !isRiskTierAtOrBelowMaxEligible(
      scoreResult.tier,
      reportOptions.autoMergePolicy.maxEligibleTier,
    )
  ) {
    return "not_eligible";
  }
  return "eligible";
};

const escapeMarkdownTableCell = (rawText: string): string =>
  rawText.replaceAll("|", "\\|").replaceAll("\n", " ").trim();

const formatNumberForDisplay = (numericValue: number): string => {
  const roundedToTenth = Math.round(numericValue * 10) / 10;
  return Number.isInteger(roundedToTenth) ? String(roundedToTenth) : roundedToTenth.toFixed(1);
};

const markdownTableRowForBreakdown = (breakdownRow: CriterionBreakdown): string => {
  const displayName = escapeMarkdownTableCell(breakdownRow.name);
  const displayJustification = escapeMarkdownTableCell(breakdownRow.justification);
  const rawScore = formatNumberForDisplay(breakdownRow.score);
  const weightPercent = formatNumberForDisplay(breakdownRow.weight);
  const weightedScore = formatNumberForDisplay(breakdownRow.weighted);
  return `| ${displayName} | ${rawScore} | ${weightPercent} | ${weightedScore} | ${displayJustification} |`;
};

const markdownLinesForSummaryHeader = (scoreResult: ScoreResult): string[] => [
  "## Merge risk",
  "",
  `**Tier:** ${scoreResult.tier}`,
  `**Score:** ${formatNumberForDisplay(scoreResult.score)}`,
  "",
];

const markdownLinesForCriteriaTable = (breakdownRows: CriterionBreakdown[]): string[] => [
  "",
  "### Criteria breakdown",
  "",
  "| Criterion | Raw | Weight % | Weighted | Notes |",
  "| --- | ---: | ---: | ---: | --- |",
  ...breakdownRows.map(markdownTableRowForBreakdown),
];

const markdownLinesForMutatorsAndDisabledCriteria = (scoreResult: ScoreResult): string[] => {
  const lines: string[] = [];
  if (scoreResult.mutatorsApplied.length > 0) {
    const escapedMutatorIds = scoreResult.mutatorsApplied.map(escapeMarkdownTableCell);
    lines.push(`_Mutators applied:_ ${escapedMutatorIds.join(", ")}`);
  }
  if (scoreResult.disabledCriteria.length > 0) {
    const escapedCriterionIds = scoreResult.disabledCriteria.map(escapeMarkdownTableCell);
    lines.push(`_Criteria disabled (config or self-disable):_ ${escapedCriterionIds.join(", ")}`);
  }
  return lines;
};

/**
 * Markdown summary suitable for an optional change-request comment (LLD reporting flow).
 *
 * @param scoreResult - Outcome from {@link score}.
 */
export const buildMergeRiskCommentMarkdown = (scoreResult: ScoreResult): string => {
  const summaryLines = markdownLinesForSummaryHeader(scoreResult);
  const tableLines = markdownLinesForCriteriaTable(scoreResult.breakdown);
  const auditLines = markdownLinesForMutatorsAndDisabledCriteria(scoreResult);
  const bodyLines = [...summaryLines, ...tableLines];
  if (auditLines.length > 0) {
    bodyLines.push("", auditLines.join("\n\n"));
  }
  return `${bodyLines.join("\n")}\n`;
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
  autoMergeOutcome: autoMergeOutcomeFromReportPolicy(scoreResult, reportOptions),
});
