/**
 * Reject paths that could escape the repository root when passed to git.
 *
 * @see docs/adrs/0010-contextual-analysis-at-head.md
 */
const UNSAFE_REPOSITORY_PATH = /(?:\0|\.\.(?:\/|$))/;

/**
 * @param repositoryRelativePath - Path from the GitHub API or git output.
 * @throws When the path contains NUL bytes or `..` segments.
 */
export const assertSafeRepositoryRelativePath = (repositoryRelativePath: string): void => {
  const normalizedPath = repositoryRelativePath.replaceAll("\\", "/");
  if (UNSAFE_REPOSITORY_PATH.test(normalizedPath)) {
    throw new Error(`Unsafe repository-relative path: ${repositoryRelativePath}`);
  }
};
