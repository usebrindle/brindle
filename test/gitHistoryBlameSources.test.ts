/**
 * Integration tests for git history and blame sources at merge-base.
 *
 * @see docs/designs/lld-author-familiarity-criterion.md
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createGitBlameSource } from "../adapters/github/contextual/createGitBlameSource.js";
import { createGitHistorySource } from "../adapters/github/contextual/createGitHistorySource.js";
import {
  aggregateGitBlameStats,
  parseGitBlameOutput,
} from "../adapters/github/contextual/parseGitBlameOutput.js";

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

const resolveMergeBase = (
  repositoryRoot: string,
  baseBranch: string,
  headBranch: string,
): string => {
  return execFileSync("git", ["merge-base", baseBranch, headBranch], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
};

describe("parseGitBlameOutput", () => {
  it("parses ownership and windowed churn from git blame -e output", () => {
    const blameOutput = [
      "^aaaaaaa (<other@example.com> 2024-01-01 00:00:00 +0000 1) legacy line",
      "bbbbbbb (<author@example.com> 2024-06-01 00:00:00 +0000 2) owned line",
      "bbbbbbb (<author@example.com> 2024-06-01 00:00:00 +0000 3)",
      "ccccccc (<peer@example.com> 2024-06-02 00:00:00 +0000 4) peer line",
    ].join("\n");

    const parsedLines = parseGitBlameOutput(blameOutput);
    const contentOwnership = aggregateGitBlameStats(parsedLines, "author@example.com", false);
    const windowedChurn = aggregateGitBlameStats(parsedLines, "author@example.com", true);

    expect(contentOwnership).toEqual({
      authorOwnedLineCount: 1,
      totalBlameableLineCount: 3,
      authorChangedLineCount: 0,
      totalChangedLineCount: 0,
    });
    expect(windowedChurn).toEqual({
      authorOwnedLineCount: 1,
      totalBlameableLineCount: 3,
      authorChangedLineCount: 1,
      totalChangedLineCount: 2,
    });
  });
});

describe("createGitHistorySource", () => {
  it("does not count commits on the PR branch after merge-base", () => {
    const repositoryRoot = mkdtempSync(join(tmpdir(), "brindle-git-history-"));
    const authorEmail = "author@example.com";
    const historyWindowStart = new Date("2020-01-01T00:00:00.000Z");

    try {
      runGit(repositoryRoot, ["init", "-b", "main"]);
      runGit(repositoryRoot, ["config", "user.email", authorEmail]);
      runGit(repositoryRoot, ["config", "user.name", "Test Author"]);

      commitFile(
        repositoryRoot,
        "src/owned.ts",
        "export const v1 = 1;\n",
        authorEmail,
        "2024-01-01T00:00:00.000Z",
        "initial",
      );
      commitFile(
        repositoryRoot,
        "src/owned.ts",
        "export const v2 = 2;\n",
        authorEmail,
        "2024-06-01T00:00:00.000Z",
        "pre-pr touch",
      );

      runGit(repositoryRoot, ["checkout", "-b", "feature"]);
      commitFile(
        repositoryRoot,
        "src/owned.ts",
        "export const v3 = 3;\n",
        authorEmail,
        "2025-01-01T00:00:00.000Z",
        "pr-only touch",
      );

      const baseRevision = resolveMergeBase(repositoryRoot, "main", "feature");
      const historySource = createGitHistorySource(repositoryRoot);
      const historyAtMergeBase = historySource.query({
        authorEmail,
        path: "src/owned.ts",
        since: historyWindowStart,
        revision: baseRevision,
      });

      expect(historyAtMergeBase.authorCommitCount).toBe(2);
      expect(historyAtMergeBase.totalFileCommitCount).toBe(2);
      expect(historyAtMergeBase.lastTouchDate?.toISOString()).toBe("2024-06-01T00:00:00.000Z");

      const historyAtHead = historySource.query({
        authorEmail,
        path: "src/owned.ts",
        since: historyWindowStart,
        revision: "feature",
      });

      expect(historyAtHead.authorCommitCount).toBe(3);
    } finally {
      rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });
});

describe("createGitBlameSource", () => {
  it("attributes line ownership at merge-base and excludes PR-only churn", () => {
    const repositoryRoot = mkdtempSync(join(tmpdir(), "brindle-git-blame-"));
    const authorEmail = "author@example.com";
    const historyWindowStart = new Date("2024-03-01T00:00:00.000Z");

    try {
      runGit(repositoryRoot, ["init", "-b", "main"]);
      runGit(repositoryRoot, ["config", "user.email", authorEmail]);
      runGit(repositoryRoot, ["config", "user.name", "Test Author"]);

      commitFile(
        repositoryRoot,
        "src/owned.ts",
        "export const legacy = 1;\n",
        "other@example.com",
        "2024-01-01T00:00:00.000Z",
        "legacy",
      );
      commitFile(
        repositoryRoot,
        "src/owned.ts",
        "export const legacy = 1;\nexport const owned = 2;\n",
        authorEmail,
        "2024-06-01T00:00:00.000Z",
        "pre-pr touch",
      );

      runGit(repositoryRoot, ["checkout", "-b", "feature"]);
      commitFile(
        repositoryRoot,
        "src/owned.ts",
        "export const legacy = 1;\nexport const owned = 2;\nexport const prOnly = 3;\n",
        authorEmail,
        "2025-01-01T00:00:00.000Z",
        "pr-only touch",
      );

      const baseRevision = resolveMergeBase(repositoryRoot, "main", "feature");
      const blameSource = createGitBlameSource(repositoryRoot);
      const blameAtMergeBase = blameSource.query({
        authorEmail,
        path: "src/owned.ts",
        since: historyWindowStart,
        revision: baseRevision,
      });

      expect(blameAtMergeBase).toEqual({
        authorOwnedLineCount: 1,
        totalBlameableLineCount: 2,
        authorChangedLineCount: 1,
        totalChangedLineCount: 1,
      });

      const blameAtHead = blameSource.query({
        authorEmail,
        path: "src/owned.ts",
        since: historyWindowStart,
        revision: "feature",
      });

      expect(blameAtHead.authorOwnedLineCount).toBe(2);
      expect(blameAtHead.totalBlameableLineCount).toBe(3);
    } finally {
      rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });
});
