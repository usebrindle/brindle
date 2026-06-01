/**
 * Public barrel for the platform-agnostic core.
 *
 * - **`BRINDLE_VERSION`** — package semver string.
 * - **Re-exports** from `./types.js` — neutral domain types (`PRContext`, `ScoringConfig`, …).
 * - **`score`** — entrypoint for deterministic merge-risk scoring (see `./scorer.js`).
 * - **`loadScoringConfigFromMergeRiskYaml`** / **`loadMergeRiskRepositoryYaml`** — parse and validate `.merge-risk.yml` (see `./config.js`).
 * - **`buildRiskReport`** — neutral comment + check + auto-merge metadata from a score (see `./report.js`).
 *
 * Pipeline-only types (`scorer.types.ts`, per-criterion `*.types.ts`) stay out of the barrel; **`BuildRiskReportOptions`** is exported for report policy wiring.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 */
export const BRINDLE_VERSION = "0.0.0";

export * from "./types.js";
export { score } from "./scorer.js";
export {
  assertValidScoringConfig,
  loadMergeRiskRepositoryYaml,
  loadScoringConfigFromMergeRiskYaml,
  MergeRiskConfigError,
  parseMergeRiskYamlDocument,
} from "./config.js";
export {
  buildMergeRiskCommentMarkdown,
  buildRiskReport,
  checkConclusionForTier,
} from "./report.js";
export type { BuildRiskReportOptions, CheckConclusionPolicy } from "./report.types.js";
export { IstanbulCoverageParseError, parseIstanbulCoverageJson } from "./coverage/istanbul.js";
