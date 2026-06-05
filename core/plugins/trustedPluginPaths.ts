/**
 * Pure path guardrails for trusted plugin locations (ADR 0001: stay under configured directory).
 * No filesystem or network I/O.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 */

import type { TrustedPluginsConfiguration } from "./trustedPlugins.types.js";

/**
 * Normalizes a repository-relative path to POSIX-style segments (`/` only, no `.` / `..` left).
 *
 * @param rawPath - User-supplied path from YAML (may contain backslashes on Windows-authored configs).
 * @returns Normalized path using `/`, or `null` when the path is empty, absolute, escapes above repo root, or contains NUL.
 */
export const normalizeRepositoryRelativePosixPath = (rawPath: string): string | null => {
  if (rawPath.includes("\0")) {
    return null;
  }
  const trimmed = rawPath.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.startsWith("/")) {
    return null;
  }
  if (/^[A-Za-z]:/.test(trimmed)) {
    return null;
  }
  const withForwardSlashes = trimmed.replace(/\\/g, "/");
  const segments = withForwardSlashes.split("/");
  const stack: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (stack.length === 0) {
        return null;
      }
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  if (stack.length === 0) {
    return ".";
  }
  return stack.join("/");
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

/**
 * Validates {@link TrustedPluginsConfiguration}: every plugin path normalizes and stays strictly under `directory`.
 *
 * @param trustedPlugins - Parsed config fragment (caller ensures shape; defensive checks for non-strings).
 */
export const validateTrustedPluginsPathsStayUnderDirectory = (
  trustedPlugins: TrustedPluginsConfiguration,
): TrustedPluginsPathValidation => {
  if (typeof trustedPlugins.directory !== "string") {
    return { ok: false, message: "trusted_plugins.directory must be a string." };
  }
  if (!Array.isArray(trustedPlugins.paths)) {
    return { ok: false, message: "trusted_plugins.paths must be an array." };
  }
  const normalizedDirectory = normalizeRepositoryRelativePosixPath(trustedPlugins.directory);
  if (normalizedDirectory === null) {
    return {
      ok: false,
      message: `trusted_plugins.directory is not a valid repository-relative path: ${JSON.stringify(trustedPlugins.directory)}.`,
    };
  }
  if (normalizedDirectory === ".") {
    return {
      ok: false,
      message:
        "trusted_plugins.directory must not resolve to '.'; use an explicit folder (e.g. `.merge-risk-plugins`).",
    };
  }

  const normalizedPluginPaths: string[] = [];
  for (let index = 0; index < trustedPlugins.paths.length; index += 1) {
    const rawPluginPath = trustedPlugins.paths[index];
    if (typeof rawPluginPath !== "string") {
      return {
        ok: false,
        message: `trusted_plugins.paths[${index}] must be a string.`,
      };
    }
    const normalizedPluginPath = normalizeRepositoryRelativePosixPath(rawPluginPath);
    if (normalizedPluginPath === null) {
      return {
        ok: false,
        message: `trusted_plugins.paths[${index}] is not a valid repository-relative path: ${JSON.stringify(rawPluginPath)}.`,
      };
    }
    if (!isNormalizedPathStrictlyInsideDirectory(normalizedDirectory, normalizedPluginPath)) {
      return {
        ok: false,
        message:
          `trusted_plugins.paths[${index}] (${JSON.stringify(normalizedPluginPath)}) must resolve strictly inside ` +
          `trusted_plugins.directory (${JSON.stringify(normalizedDirectory)}).`,
      };
    }
    normalizedPluginPaths.push(normalizedPluginPath);
  }

  return { ok: true, normalizedDirectory, normalizedPluginPaths };
};
