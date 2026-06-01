/**
 * Options for {@link buildRiskReport} in `report.ts`. Kept in a sibling `*.types.ts` per project convention.
 *
 * @see docs/adrs/0002-native-auto-merge.md
 * @see docs/adrs/0003-check-runs-over-commit-statuses.md
 */

/**
 * Inputs to {@link import("./report.js").checkConclusionForTier}; kept explicit so call sites stay readable.
 */
export type CheckConclusionPolicy = {
  /**
   * When `true`, a HIGH risk tier maps the check to `failure` instead of `action_required` (ADR 0003).
   * Ignored when {@link CheckConclusionPolicy.informationalCheckConclusion} is `true`.
   */
  failOnHigh: boolean;
  /**
   * When `true`, every tier maps to `success` so the published check never blocks CI or required checks;
   * MEDIUM/HIGH remain visible in the markdown body (ADR 0003 informational mode).
   */
  informationalCheckConclusion: boolean;
};

/**
 * Policy for mapping a {@link ScoreResult} to {@link RiskReport.checkConclusion} and {@link RiskReport.autoMergeOutcome}.
 */
export type BuildRiskReportOptions = {
  /**
   * When `true`, a HIGH risk tier maps the check to `failure` instead of `action_required` (ADR 0003).
   * Ignored when {@link BuildRiskReportOptions.informationalCheckConclusion} is `true`.
   */
  failOnHigh: boolean;
  /**
   * When `true` (recommended for the bundled GitHub Action), the check run conclusion is always `success`
   * so branch protection and PR check rolls stay green; tier is still in the summary markdown.
   * When omitted or `false`, ADR 0003 tier-to-conclusion mapping applies.
   */
  informationalCheckConclusion?: boolean;
  /**
   * Native auto-merge policy (ADR 0002). The adapter still performs the platform mutation; the core only classifies intent.
   */
  autoMergePolicy: {
    /**
     * When `false`, native auto-merge is never attempted; `RiskReport.autoMergeOutcome` becomes `skipped`.
     */
    enabled: boolean;
    /**
     * Inclusive upper bound on risk: tiers at or below this value qualify for the `eligible` outcome
     * when {@link BuildRiskReportOptions.autoMergePolicy.enabled} is true.
     *
     * @example `MEDIUM` allows LOW and MEDIUM; HIGH does not qualify.
     */
    maxEligibleTier: "LOW" | "MEDIUM" | "HIGH";
  };
  /**
   * When `false`, `RiskReport.autoMergeOutcome` is set to `unsupported` (e.g. Bitbucket per ADR 0007).
   */
  nativeAutoMergeSupported: boolean;
};
