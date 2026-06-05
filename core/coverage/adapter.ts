/**
 * Neutral entry for turning coverage artifact UTF-8 text into {@link import("../types.js").CoverageReport}.
 * Istanbul is the only implemented backend today; other formats stay on the LLD backlog.
 *
 * @see docs/adrs/0005-read-findings-not-run-tools.md
 * @see docs/designs/lld-merge-risk-classifier.md
 */
import type { CoverageReport } from "../types.js";

import type { SupportedCoverageArtifactFormat } from "./adapter.types.js";
import { parseIstanbulCoverageJson } from "./istanbul.js";

/**
 * @param options.format - Which parser to use (Istanbul `coverage-final` JSON only for now).
 * @param options.text - Raw file body from the platform (UTF-8).
 * @returns Neutral statement aggregates for `test_coverage`.
 */
export const parseCoverageArtifactText = (options: {
  format: SupportedCoverageArtifactFormat;
  text: string;
}): CoverageReport => parseIstanbulCoverageJson(options.text);
