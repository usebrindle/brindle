/**
 * Unified contextual evidence hydration tests (US-018).
 *
 * @see docs/designs/lld-contextual-evidence-overview.md
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { hydrateContextualEvidence } from "../adapters/github/contextual/hydrateContextualEvidence.js";

const runGit = (repositoryRoot: string, gitArguments: readonly string[]): void => {
  execFileSync("git", gitArguments, { cwd: repositoryRoot, stdio: "pipe" });
};

const runGitWithEnv = (
  repositoryRoot: string,
  gitArguments: readonly string[],
  environmentVariables: Readonly<Record<string, string>>,
): void => {
  execFileSync("git", gitArguments, {
    cwd: repositoryRoot,
    stdio: "pipe",
    env: { ...process.env, ...environmentVariables },
  });
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

const commitFile = (
  repositoryRoot: string,
  repositoryRelativePath: string,
  fileText: string,
  authorEmail: string,
  authorDateIso: string,
  commitMessage: string,
): void => {
  writeTrackedFile(repositoryRoot, repositoryRelativePath, fileText);
  runGit(repositoryRoot, ["add", repositoryRelativePath]);
  runGitWithEnv(
    repositoryRoot,
    ["commit", "-m", commitMessage],
    {
      GIT_AUTHOR_NAME: "Test Author",
      GIT_AUTHOR_EMAIL: authorEmail,
      GIT_COMMITTER_NAME: "Test Author",
      GIT_COMMITTER_EMAIL: authorEmail,
      GIT_AUTHOR_DATE: authorDateIso,
      GIT_COMMITTER_DATE: authorDateIso,
    },
  );
};

describe("hydrateContextualEvidence", () => {
  it("returns empty snapshot when both criteria flags are false", () => {
    const result = hydrateContextualEvidence({
      repositoryRoot: "/tmp/unused",
      baseRef: "main",
      headRef: "head",
      authorLogin: "alice",
      changedPaths: [],
      classifiedAt: new Date("2026-06-01T00:00:00.000Z"),
      hydrateAuthorFamiliarity: false,
      hydrateBlastRadius: false,
    });

    expect(result.contextualEvidence).toEqual({
      familiarityFindings: [],
      blastRadiusFindings: [],
      notAnalyzedForBlastRadius: [],
      limitations: [],
      enabledExtractors: [],
    });
  });

  it("hydrates familiarity-only findings without blast-radius graph I/O metadata", () => {
    const repositoryRoot = mkdtempSync(join(tmpdir(), "brindle-contextual-hydration-"));
    const authorEmail = "author@example.com";

    try {
      runGit(repositoryRoot, ["init", "-b", "main"]);
      runGit(repositoryRoot, ["config", "user.email", authorEmail]);
      runGit(repositoryRoot, ["config", "user.name", "Test Author"]);

      commitFile(
        repositoryRoot,
        "src/legacy.ts",
        "export const legacy = 1;\n",
        authorEmail,
        "2026-01-01T00:00:00.000Z",
        "base legacy",
      );

      runGit(repositoryRoot, ["checkout", "-b", "feature"]);
      commitFile(
        repositoryRoot,
        "src/new.ts",
        "export const fresh = 1;\n",
        authorEmail,
        "2026-06-01T00:00:00.000Z",
        "add file",
      );

      const result = hydrateContextualEvidence({
        repositoryRoot,
        baseRef: "main",
        headRef: "feature",
        authorLogin: "pr-author",
        changedPaths: ["src/legacy.ts", "src/new.ts"],
        classifiedAt: new Date("2026-06-15T00:00:00.000Z"),
        hydrateAuthorFamiliarity: true,
        hydrateBlastRadius: false,
      });

      expect(result.baseRevision).toMatch(/^[0-9a-f]{40}$/);
      expect(result.authorEmails).toContain(authorEmail);
      expect(result.contextualEvidence.familiarityFindings).toHaveLength(2);
      expect(result.contextualEvidence.familiarityFindings.find((finding) => finding.touchedFile === "src/new.ts")?.characterization).toBe("high");
      expect(result.contextualEvidence.blastRadiusFindings).toEqual([]);
      expect(result.contextualEvidence.enabledExtractors).toEqual([]);
    } finally {
      rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });
});
