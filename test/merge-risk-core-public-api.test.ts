/**
 * Contract for the published `@usebrindle/merge-risk-core` tarball (runtime exports + adapter type).
 * Runtime assertions load `packages/merge-risk-core/dist/index.js` (CI builds that package before Vitest).
 *
 * Typecheck does not import `dist` modules so `tsc --noEmit` succeeds on a clean clone without `tsup` first.
 *
 * Allowlist: {@link MERGE_RISK_CORE_RUNTIME_EXPORTS}.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

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

const distTypesPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../packages/merge-risk-core/dist/index.d.ts",
);

describe("@usebrindle/merge-risk-core published surface", () => {
  beforeAll(() => {
    if (!existsSync(distIndexPath)) {
      throw new Error(`Missing ${distIndexPath}. Run: npm run build:merge-risk-core`);
    }
    if (!existsSync(distTypesPath)) {
      throw new Error(`Missing ${distTypesPath}. Run: npm run build:merge-risk-core`);
    }
  });

  it("runtime export names match allowlist", async () => {
    const mod = (await import(distIndexPath)) as Record<string, unknown>;
    const names = Object.keys(mod)
      .filter((key) => key !== "default")
      .sort();
    expect(names).toEqual([...MERGE_RISK_CORE_RUNTIME_EXPORTS].sort());
  });

  it("built package declares PlatformAdapter for npm consumers", () => {
    const declarationFileText = readFileSync(distTypesPath, "utf8");
    expect(declarationFileText).toMatch(/interface\s+PlatformAdapter\b/);
  });
});
