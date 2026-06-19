/** Normalize Windows separators to forward slashes for repo-relative paths. */
export const normalizeForwardSlashes = (filePath: string): string =>
  filePath.replaceAll("\\", "/");

/** Normalize a repo-relative path (forward slashes, no leading `./`). */
export const normalizeRepoPath = (filePath: string): string =>
  normalizeForwardSlashes(filePath).replace(/^\.\//, "");
