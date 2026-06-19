/**
 * Pure path resolution for stylesheet specifiers (relative, partial, index, aliases).
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import { dirname, posix } from "node:path";

import type { ExtractorContext } from "./types.js";
import {
  STYLESHEET_FILE_EXTENSIONS,
  STYLESHEET_RESOLUTION_EXTENSIONS,
  STYLESHEET_RESOLUTION_CONFIG_KEYS,
  type StylesheetResolutionConfig,
} from "./stylesheetExtractor.types.js";

const normalizeRepoPath = (filePath: string): string =>
  filePath.replace(/\\/g, "/").replace(/^\.\//, "");

const hasStylesheetExtension = (filePath: string): boolean => {
  const lower = filePath.toLowerCase();
  return STYLESHEET_FILE_EXTENSIONS.some((extension) => lower.endsWith(extension));
};

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

const isPathsRecord = (
  value: unknown,
): value is Readonly<Record<string, readonly string[]>> => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return Object.values(value).every((entry) => isStringArray(entry));
};

/** Read stylesheet resolution hints from the shared extractor context. */
export const readStylesheetResolutionConfig = (
  context: ExtractorContext,
): StylesheetResolutionConfig => {
  const { resolutionConfig } = context;
  const baseUrlValue = resolutionConfig[STYLESHEET_RESOLUTION_CONFIG_KEYS.baseUrl];
  const pathsValue = resolutionConfig[STYLESHEET_RESOLUTION_CONFIG_KEYS.tsconfigPaths];

  return {
    baseUrl: typeof baseUrlValue === "string" ? normalizeRepoPath(baseUrlValue) : undefined,
    tsconfigPaths: isPathsRecord(pathsValue) ? pathsValue : undefined,
  };
};

const applyTsconfigPathMapping = (
  specifier: string,
  tsconfigPaths: Readonly<Record<string, readonly string[]>>,
): string | null => {
  for (const [pattern, replacements] of Object.entries(tsconfigPaths)) {
    const wildcardIndex = pattern.indexOf("*");
    if (wildcardIndex === -1) {
      if (specifier === pattern && replacements[0]) {
        return normalizeRepoPath(replacements[0]);
      }
      continue;
    }

    const prefix = pattern.slice(0, wildcardIndex);
    const suffix = pattern.slice(wildcardIndex + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
      continue;
    }

    const matchedSegment = specifier.slice(prefix.length, specifier.length - suffix.length);
    for (const replacement of replacements) {
      const replacementWildcardIndex = replacement.indexOf("*");
      if (replacementWildcardIndex === -1) {
        return normalizeRepoPath(replacement);
      }
      const resolved = `${replacement.slice(0, replacementWildcardIndex)}${matchedSegment}${replacement.slice(replacementWildcardIndex + 1)}`;
      return normalizeRepoPath(resolved);
    }
  }

  return null;
};

const stripQueryAndFragment = (specifier: string): string =>
  specifier.split(/[?#]/, 1)[0] ?? specifier;

const partialAndIndexCandidates = (joinedPath: string): readonly string[] => {
  const normalized = normalizeRepoPath(joinedPath);
  if (hasStylesheetExtension(normalized)) {
    return [normalized];
  }

  const directory = dirname(normalized);
  const baseName = posix.basename(normalized);
  const candidates: string[] = [];

  for (const extension of STYLESHEET_RESOLUTION_EXTENSIONS) {
    candidates.push(posix.join(directory, `_${baseName}${extension}`));
    candidates.push(posix.join(directory, `${baseName}${extension}`));
  }

  for (const extension of STYLESHEET_RESOLUTION_EXTENSIONS) {
    candidates.push(posix.join(normalized, `_index${extension}`));
    candidates.push(posix.join(normalized, `index${extension}`));
  }

  return candidates;
};

const resolveRelativeSpecifier = (
  fromFile: string,
  specifier: string,
): string | null => {
  const fromDirectory = dirname(normalizeRepoPath(fromFile));
  const joinedPath = normalizeRepoPath(posix.join(fromDirectory, specifier));
  const candidates = partialAndIndexCandidates(joinedPath);
  return candidates[0] ?? null;
};

const resolveAliasedSpecifier = (
  specifier: string,
  resolutionConfig: StylesheetResolutionConfig,
): string | null => {
  if (resolutionConfig.tsconfigPaths) {
    const mappedPath = applyTsconfigPathMapping(specifier, resolutionConfig.tsconfigPaths);
    if (mappedPath) {
      const candidates = partialAndIndexCandidates(mappedPath);
      return candidates[0] ?? null;
    }
  }

  if (resolutionConfig.baseUrl) {
    const fromBaseUrl = posix.join(resolutionConfig.baseUrl, specifier);
    const candidates = partialAndIndexCandidates(fromBaseUrl);
    return candidates[0] ?? null;
  }

  return null;
};

const resolveStylesheetPath = (
  fromFile: string,
  specifier: string,
  resolutionConfig: StylesheetResolutionConfig,
): string | null => {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return resolveRelativeSpecifier(fromFile, specifier);
  }

  const aliased = resolveAliasedSpecifier(specifier, resolutionConfig);
  if (aliased) {
    return aliased;
  }

  return resolveRelativeSpecifier(fromFile, specifier);
};

/**
 * Resolve a stylesheet specifier from a stylesheet file to a repo-relative path.
 * @returns null for built-in sass modules, bare package imports, and other unresolved specifiers.
 */
export const resolveStylesheetSpecifier = (
  fromFile: string,
  specifier: string,
  resolutionConfig: StylesheetResolutionConfig,
): string | null => {
  const normalizedSpecifier = stripQueryAndFragment(specifier.trim());
  if (!normalizedSpecifier || normalizedSpecifier.startsWith("sass:")) {
    return null;
  }

  return resolveStylesheetPath(normalizeRepoPath(fromFile), normalizedSpecifier, resolutionConfig);
};
