/**
 * Pure path guardrails for trusted plugin locations (ADR 0001: stay under configured directory).
 * No filesystem or network I/O.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 */

import type { TrustedPluginsConfiguration } from "./trustedPlugins.types.js";

const repositoryRelativePathContainsNul = (rawPath: string): boolean => rawPath.includes("\0");

const trimmedRepositoryRelativePathOrNull = (rawPath: string): string | null => {
  const trimmed = rawPath.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const trimmedPathLooksAbsolutePosixOrWindows = (trimmedPath: string): boolean =>
  trimmedPath.startsWith("/") || /^[A-Za-z]:/.test(trimmedPath);

/**
 * Collapses `.` / `..` / empty segments. Returns `null` when `..` would escape above the repo-relative root.
 */
const normalizedPathSegmentsOrNull = (pathSegments: readonly string[]): string[] | null =>
  pathSegments.reduce<string[] | null>((stack, segment) => {
    if (stack === null) {
      return null;
    }
    if (segment === "" || segment === ".") {
      return stack;
    }
    if (segment === "..") {
      if (stack.length === 0) {
        return null;
      }
      return stack.slice(0, -1);
    }
    return [...stack, segment];
  }, []);

const joinedRepositoryRelativePathOrDot = (normalizedSegments: readonly string[]): string =>
  normalizedSegments.length === 0 ? "." : normalizedSegments.join("/");

/**
 * Normalizes a repository-relative path to POSIX-style segments (`/` only, no `.` / `..` left).
 *
 * @param rawPath - User-supplied path from YAML (may contain backslashes on Windows-authored configs).
 * @returns Normalized path using `/`, or `null` when the path is empty, absolute, escapes above repo root, or contains NUL.
 */
export const normalizeRepositoryRelativePosixPath = (rawPath: string): string | null => {
  if (repositoryRelativePathContainsNul(rawPath)) {
    return null;
  }
  const trimmedPath = trimmedRepositoryRelativePathOrNull(rawPath);
  if (trimmedPath === null) {
    return null;
  }
  if (trimmedPathLooksAbsolutePosixOrWindows(trimmedPath)) {
    return null;
  }
  const pathSegments = trimmedPath.replaceAll("\\", "/").split("/");
  const normalizedSegments = normalizedPathSegmentsOrNull(pathSegments);
  if (normalizedSegments === null) {
    return null;
  }
  return joinedRepositoryRelativePathOrDot(normalizedSegments);
};

/**
 * @param normalizedDirectory - Output of {@link normalizeRepositoryRelativePosixPath} for the plugin root.
 * @param normalizedCandidateFilePath - Output of {@link normalizeRepositoryRelativePosixPath} for a plugin file.
 * @returns `true` when the candidate is a file path strictly inside the directory (not the directory itself).
 */
export const isNormalizedPathStrictlyInsideDirectory = (
  normalizedDirectory: string,
  normalizedCandidateFilePath: string,
): boolean => {
  if (normalizedDirectory === "." || normalizedDirectory.length === 0) {
    return false;
  }
  const prefix = `${normalizedDirectory}/`;
  return (
    normalizedCandidateFilePath.length > prefix.length &&
    normalizedCandidateFilePath.startsWith(prefix)
  );
};

export type TrustedPluginsPathValidation =
  | { ok: true; normalizedDirectory: string; normalizedPluginPaths: string[] }
  | { ok: false; message: string };

type SingleTrustedPluginPathResolution =
  | { ok: true; normalizedPath: string }
  | { ok: false; message: string };

const isResolvedTrustedPluginPath = (
  outcome: SingleTrustedPluginPathResolution,
): outcome is { ok: true; normalizedPath: string } => outcome.ok;

const validateSingleTrustedPluginPath = (options: {
  rawPluginPath: unknown;
  pathIndex: number;
  normalizedDirectory: string;
}): SingleTrustedPluginPathResolution => {
  const { rawPluginPath, pathIndex, normalizedDirectory } = options;
  if (typeof rawPluginPath !== "string") {
    return {
      ok: false,
      message: `trusted_plugins.paths[${pathIndex}] must be a string.`,
    };
  }
  const normalizedPluginPath = normalizeRepositoryRelativePosixPath(rawPluginPath);
  if (normalizedPluginPath === null) {
    return {
      ok: false,
      message: `trusted_plugins.paths[${pathIndex}] is not a valid repository-relative path: ${JSON.stringify(rawPluginPath)}.`,
    };
  }
  if (!isNormalizedPathStrictlyInsideDirectory(normalizedDirectory, normalizedPluginPath)) {
    return {
      ok: false,
      message:
        `trusted_plugins.paths[${pathIndex}] (${JSON.stringify(normalizedPluginPath)}) must resolve strictly inside ` +
        `trusted_plugins.directory (${JSON.stringify(normalizedDirectory)}).`,
    };
  }
  return { ok: true, normalizedPath: normalizedPluginPath };
};

const validatedNormalizedDirectoryOrFailure = (
  directory: unknown,
): { ok: true; normalizedDirectory: string } | { ok: false; message: string } => {
  if (typeof directory !== "string") {
    return { ok: false, message: "trusted_plugins.directory must be a string." };
  }
  const normalizedDirectory = normalizeRepositoryRelativePosixPath(directory);
  if (normalizedDirectory === null) {
    return {
      ok: false,
      message: `trusted_plugins.directory is not a valid repository-relative path: ${JSON.stringify(directory)}.`,
    };
  }
  if (normalizedDirectory === ".") {
    return {
      ok: false,
      message:
        "trusted_plugins.directory must not resolve to '.'; use an explicit folder (e.g. `.merge-risk-plugins`).",
    };
  }
  return { ok: true, normalizedDirectory };
};

/**
 * Validates {@link TrustedPluginsConfiguration}: every plugin path normalizes and stays strictly under `directory`.
 *
 * @param trustedPlugins - Parsed config fragment (caller ensures shape; defensive checks for non-strings).
 */
export const validateTrustedPluginsPathsStayUnderDirectory = (
  trustedPlugins: TrustedPluginsConfiguration,
): TrustedPluginsPathValidation => {
  if (!Array.isArray(trustedPlugins.paths)) {
    return { ok: false, message: "trusted_plugins.paths must be an array." };
  }

  const directoryOutcome = validatedNormalizedDirectoryOrFailure(trustedPlugins.directory);
  if (!directoryOutcome.ok) {
    return directoryOutcome;
  }
  const { normalizedDirectory } = directoryOutcome;

  const perPathOutcomes = trustedPlugins.paths.map((rawPluginPath, pathIndex) =>
    validateSingleTrustedPluginPath({ rawPluginPath, pathIndex, normalizedDirectory }),
  );

  if (!perPathOutcomes.every(isResolvedTrustedPluginPath)) {
    const rejectedPath = perPathOutcomes.find((outcome) => !outcome.ok);
    return rejectedPath ?? { ok: false, message: "trusted_plugins.paths validation failed unexpectedly." };
  }

  const normalizedPluginPaths = perPathOutcomes.map((outcome) => outcome.normalizedPath);

  return { ok: true, normalizedDirectory, normalizedPluginPaths };
};
