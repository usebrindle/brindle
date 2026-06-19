/**
 * Resolves added vs modified change kind for PR changed paths at merge-base.
 *
 * @see docs/designs/lld-author-familiarity-criterion.md
 */
import type { ChangedFileEntry } from "../../../core/contextual/familiarity.types.js";
import type { FileChangeKind } from "../../../core/contextual/contextual.types.js";

import { runGitCommand } from "./gitCommand.js";
import type { HydrateFamiliarityPrContextDependencies } from "./hydrateFamiliarityPrContext.types.js";
import { pathExistsAtGitRevision } from "./pathExistsAtGitRevision.js";

const normalizeRepositoryRelativePath = (repositoryRelativePath: string): string =>
  repositoryRelativePath.replace(/\\/g, "/");

/**
 * Paths added between merge-base and head via `git diff --diff-filter=A`.
 */
export const resolveAddedPathsBetweenRefs = (
  repositoryRoot: string,
  baseRef: string,
  headRef: string,
  dependencies?: HydrateFamiliarityPrContextDependencies,
): ReadonlySet<string> => {
  const runGit = dependencies?.runGitCommand ?? runGitCommand;

  try {
    const diffOutput = runGit(repositoryRoot, [
      "diff",
      "--diff-filter=A",
      "--name-only",
      `${baseRef}...${headRef}`,
    ]);

    if (diffOutput.length === 0) {
      return new Set();
    }

    const addedPaths = new Set<string>();
    for (const line of diffOutput.split("\n")) {
      const trimmedLine = line.trim();
      if (trimmedLine.length > 0) {
        addedPaths.add(normalizeRepositoryRelativePath(trimmedLine));
      }
    }
    return addedPaths;
  } catch {
    return new Set();
  }
};

/**
 * @returns `added` when the path is in the diff-added set or absent at `baseRevision`.
 */
export const resolveFileChangeKind = (
  repositoryRoot: string,
  baseRevision: string,
  filePath: string,
  addedPaths: ReadonlySet<string>,
  dependencies?: HydrateFamiliarityPrContextDependencies,
): FileChangeKind => {
  const normalizedPath = normalizeRepositoryRelativePath(filePath);

  if (addedPaths.has(normalizedPath)) {
    return "added";
  }

  if (!pathExistsAtGitRevision(repositoryRoot, baseRevision, normalizedPath, dependencies)) {
    return "added";
  }

  return "modified";
};

/**
 * Maps each changed path to {@link ChangedFileEntry} with merge-base change kind.
 */
export const resolveChangedFileEntries = (
  repositoryRoot: string,
  baseRef: string,
  headRef: string,
  baseRevision: string,
  changedPaths: readonly string[],
  dependencies?: HydrateFamiliarityPrContextDependencies,
): readonly ChangedFileEntry[] => {
  const addedPaths = resolveAddedPathsBetweenRefs(
    repositoryRoot,
    baseRef,
    headRef,
    dependencies,
  );

  return changedPaths.map((changedPath) => ({
    path: normalizeRepositoryRelativePath(changedPath),
    changeKind: resolveFileChangeKind(
      repositoryRoot,
      baseRevision,
      changedPath,
      addedPaths,
      dependencies,
    ),
  }));
};
