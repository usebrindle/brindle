/**
 * Public barrel for the platform-agnostic core.
 *
 * - **`BRINDLE_VERSION`** — package semver string.
 * - **Re-exports** from `./types.js` — neutral domain types (`PRContext`, `ScoringConfig`, …).
 * - **`score`** — entrypoint for deterministic merge-risk scoring (see `./scorer.js`).
 *
 * Pipeline-only types (`scorer.types.ts`, per-criterion `*.types.ts`) are not re-exported here.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 */
export const BRINDLE_VERSION = "0.0.0";

export * from "./types.js";
export { score } from "./scorer.js";
