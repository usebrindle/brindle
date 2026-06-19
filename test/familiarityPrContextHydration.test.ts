/**
 * Tests for merge-base, change-kind, and author-email hydration (US-009).
 *
 * @see docs/designs/lld-author-familiarity-criterion.md
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { hydrateFamiliarityPrContext } from "../adapters/github/contextual/hydrateFamiliarityPrContext.js";
import {
  githubNoreplyEmailsForLogin,
  resolveAuthorEmails,
} from "../adapters/github/contextual/resolveAuthorEmails.js";
import { resolveChangedFileEntries } from "../adapters/github/contextual/resolveChangedFileEntries.js";
import { resolveMergeBaseRevision } from "../adapters/github/contextual/resolveMergeBaseRevision.js";

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

describe("resolveAuthorEmails", () => {
  it("merges head commit email, GitHub noreply pattern, and config overrides", () => {
    expect(
      resolveAuthorEmails(
        "41898282+octocat@users.noreply.github.com",
        "octocat",
        ["team-alias@example.com"],
      ),
    ).toEqual([
      "41898282+octocat@users.noreply.github.com",
      "octocat@users.noreply.github.com",
      "team-alias@example.com",
    ]);
  });

  it("returns GitHub noreply pattern when head email is missing", () => {
    expect(githubNoreplyEmailsForLogin("octocat")).toEqual([
      "octocat@users.noreply.github.com",
    ]);
    expect(resolveAuthorEmails(null, "octocat")).toEqual(["octocat@users.noreply.github.com"]);
  });
});

describe("hydrateFamiliarityPrContext", () => {
  it("resolves merge-base, one added and one modified file, and author emails", () => {
    const repositoryRoot = mkdtempSync(join(tmpdir(), "brindle-familiarity-hydration-"));
    const authorEmail = "author@example.com";
    const authorLogin = "pr-author";

    try {
      runGit(repositoryRoot, ["init", "-b", "main"]);
      runGit(repositoryRoot, ["config", "user.email", authorEmail]);
      runGit(repositoryRoot, ["config", "user.name", "Test Author"]);

      commitFile(
        repositoryRoot,
        "src/existing.ts",
        "export const existing = 1;\n",
        authorEmail,
        "2024-01-01T00:00:00.000Z",
        "initial",
      );

      runGit(repositoryRoot, ["checkout", "-b", "feature"]);
      commitFile(
        repositoryRoot,
        "src/existing.ts",
        "export const existing = 2;\n",
        authorEmail,
        "2025-01-01T00:00:00.000Z",
        "modify existing",
      );
      commitFile(
        repositoryRoot,
        "src/new-file.ts",
        "export const brandNew = 1;\n",
        authorEmail,
        "2025-01-02T00:00:00.000Z",
        "add new file",
      );

      const baseRevision = resolveMergeBaseRevision(repositoryRoot, "main", "feature");
      const changedFileEntries = resolveChangedFileEntries(
        repositoryRoot,
        "main",
        "feature",
        baseRevision,
        ["src/existing.ts", "src/new-file.ts"],
      );

      expect(changedFileEntries).toEqual([
        { path: "src/existing.ts", changeKind: "modified" },
        { path: "src/new-file.ts", changeKind: "added" },
      ]);

      const hydrationResult = hydrateFamiliarityPrContext({
        repositoryRoot,
        baseRef: "main",
        headRef: "feature",
        authorLogin,
        changedPaths: ["src/existing.ts", "src/new-file.ts"],
        configAuthorEmails: ["alias@example.com"],
      });

      expect(hydrationResult.baseRevision).toBe(baseRevision);
      expect(hydrationResult.changedFileEntries).toEqual(changedFileEntries);
      expect(hydrationResult.authorEmails).toEqual([
        authorEmail,
        "pr-author@users.noreply.github.com",
        "alias@example.com",
      ]);
    } finally {
      rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });
});
