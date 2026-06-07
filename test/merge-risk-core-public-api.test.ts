/**
 * Contract for the published `@usebrindle/merge-risk-core` tarball (runtime exports + adapter type).
 * Requires `npm run build:merge-risk-core` before `npm test` (CI builds the package before this step).
 *
 * Allowlist: {@link MERGE_RISK_CORE_RUNTIME_EXPORTS}.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import type { PlatformAdapter } from "../packages/merge-risk-core/dist/index.js";

/** Keep in sync with `packages/merge-risk-core/dist/index.js` runtime `Object.keys` after each intentional API change. */
const MERGE_RISK_CORE_RUNTIME_EXPORTS = [
  "BRINDLE_VERSION",
  "IstanbulCoverageParseError",
  "MergeRiskConfigError",
  "assertValidScoringConfig",
  "buildMergeRiskCommentMarkdown",
  "buildRiskReport",
  "checkConclusionForTier",
  "loadMergeRiskRepositoryYaml",
  "loadScoringConfigFromMergeRiskYaml",
  "parseCoverageArtifactText",
  "parseIstanbulCoverageJson",
  "parseMergeRiskYamlDocument",
  "score",
  "scoreWithRegistries",
] as const;

const distIndexPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../packages/merge-risk-core/dist/index.js",
);

describe("@usebrindle/merge-risk-core published surface", () => {
  beforeAll(() => {
    if (!existsSync(distIndexPath)) {
      throw new Error(`Missing ${distIndexPath}. Run: npm run build:merge-risk-core`);
    }
  });

  it("runtime export names match allowlist", async () => {
    const mod = (await import(distIndexPath)) as Record<string, unknown>;
    const names = Object.keys(mod)
      .filter((key) => key !== "default")
      .sort();
    expect(names).toEqual([...MERGE_RISK_CORE_RUNTIME_EXPORTS].sort());
  });

  it("PlatformAdapter is a public type export (from dist .d.ts)", () => {
    const _adapterType: PlatformAdapter | undefined = undefined;
    expect(_adapterType).toBeUndefined();
  });
});
