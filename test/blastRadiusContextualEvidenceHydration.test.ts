/**
 * End-to-end blast-radius hydration tests (US-013).
 *
 * @see docs/designs/lld-blast-radius-criterion.md
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { hydrateBlastRadiusContextualEvidence } from "../adapters/github/contextual/hydrateBlastRadiusContextualEvidence.js";
import { defaultExtractorRegistry } from "../core/contextual/extractors/builtins.js";

const runGit = (repositoryRoot: string, gitArguments: readonly string[]): void => {
  execFileSync("git", gitArguments, { cwd: repositoryRoot, stdio: "pipe" });
};

const writeTrackedFile = (
  repositoryRoot: string,
  repositoryRelativePath: string,
  fileText: string,
): void => {
  const absolutePath = join(repositoryRoot, repositoryRelativePath);
  mkdirSync(join(absolutePath, ".."), { recursive: true });
  writeFileSync(absolutePath, fileText, "utf8");
};

const createBlastRadiusFixtureRepository = (): string => {
  const repositoryRoot = mkdtempSync(join(tmpdir(), "brindle-blast-radius-hydration-"));

  runGit(repositoryRoot, ["init"]);
  runGit(repositoryRoot, ["config", "user.email", "test@example.com"]);
  runGit(repositoryRoot, ["config", "user.name", "Test User"]);

  writeTrackedFile(
    repositoryRoot,
    "src/shared/util.ts",
    `export const sharedValue = 1;\n`,
  );
  writeTrackedFile(
    repositoryRoot,
    "src/consumer-a.ts",
    `import { sharedValue } from './shared/util';\nexport const a = sharedValue;\n`,
  );
  writeTrackedFile(
    repositoryRoot,
    "src/consumer-b.ts",
    `import { sharedValue } from './shared/util';\nexport const b = sharedValue;\n`,
  );
  writeTrackedFile(
    repositoryRoot,
    "src/chain.ts",
    `import { a } from './consumer-a';\nexport const chain = a;\n`,
  );
  writeTrackedFile(repositoryRoot, "README.md", "# fixture\n");

  runGit(repositoryRoot, ["add", "."]);
  runGit(repositoryRoot, ["commit", "-m", "fixture"]);

  return repositoryRoot;
};

describe("hydrateBlastRadiusContextualEvidence", () => {
  it("produces findings for a changed .ts file with known dependents", () => {
    const repositoryRoot = createBlastRadiusFixtureRepository();

    try {
      const result = hydrateBlastRadiusContextualEvidence({
        repoRoot: repositoryRoot,
        enabledExtractorIds: ["js_ts"],
        registry: defaultExtractorRegistry,
        changedFiles: ["src/shared/util.ts"],
      });

      expect(result.enabledExtractors).toEqual(["js_ts"]);
      expect(result.notAnalyzedForBlastRadius).toEqual([]);
      expect(result.limitations.length).toBeGreaterThan(0);
      expect(result.blastRadiusFindings).toEqual([
        {
          changedFile: "src/shared/util.ts",
          directDependentCount: 2,
          directDependents: ["src/consumer-a.ts", "src/consumer-b.ts"],
          transitiveReachCount: 3,
          characterization: "moderate",
        },
      ]);
    } finally {
      rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });

  it("leaves blastRadiusFindings empty when all changed files are unsupported (selfDisable path)", () => {
    const repositoryRoot = createBlastRadiusFixtureRepository();

    try {
      const result = hydrateBlastRadiusContextualEvidence({
        repoRoot: repositoryRoot,
        enabledExtractorIds: ["js_ts"],
        registry: defaultExtractorRegistry,
        changedFiles: ["README.md"],
      });

      expect(result.blastRadiusFindings).toEqual([]);
      expect(result.notAnalyzedForBlastRadius).toEqual([
        {
          path: "README.md",
          reason: "no extractor for extension .md",
        },
      ]);
    } finally {
      rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });

  it("analyzes only supported changed files when the pull request mixes extensions", () => {
    const repositoryRoot = createBlastRadiusFixtureRepository();

    try {
      const result = hydrateBlastRadiusContextualEvidence({
        repoRoot: repositoryRoot,
        enabledExtractorIds: ["js_ts", "stylesheet"],
        registry: defaultExtractorRegistry,
        changedFiles: ["src/shared/util.ts", "README.md"],
      });

      expect(result.blastRadiusFindings).toHaveLength(1);
      expect(result.blastRadiusFindings[0]?.changedFile).toBe("src/shared/util.ts");
      expect(result.notAnalyzedForBlastRadius).toEqual([
        {
          path: "README.md",
          reason: "no extractor for extension .md",
        },
      ]);
    } finally {
      rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });
});
