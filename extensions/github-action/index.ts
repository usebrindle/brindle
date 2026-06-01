/**
 * GitHub Actions entry: scores the pull request from base-branch config and publishes results.
 *
 * @see docs/adrs/0001-no-pr-head-execution.md
 * @see docs/designs/lld-merge-risk-classifier.md
 */
import { setFailed } from "@actions/core";

import { runMergeRiskGithubAction } from "./runMergeRiskGithubAction.js";

try {
  await runMergeRiskGithubAction();
} catch (error: unknown) {
  setFailed(error instanceof Error ? error : new Error(String(error)));
}
