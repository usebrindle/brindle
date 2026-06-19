/**
 * Pure path resolution for js_ts module specifiers (relative, baseUrl, tsconfig paths).
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import { dirname, posix } from "node:path";

import { normalizeRepoPath } from "../pathNormalize.js";
import type { ExtractorContext } from "./types.js";
import {
  JS_TS_MODULE_EXTENSIONS,
  JS_TS_RESOLUTION_CONFIG_KEYS,
  JS_TS_STYLE_EXTENSIONS,
  type JsTsResolutionConfig,
} from "./jsTsExtractor.types.js";

const hasKnownExtension = (filePath: string): boolean => {
  const lower = filePath.toLowerCase();
  return (
    JS_TS_MODULE_EXTENSIONS.some((extension) => lower.endsWith(extension)) ||
    JS_TS_STYLE_EXTENSIONS.some((extension) => lower.endsWith(extension))
  );
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

/** Read js_ts resolution hints from the shared extractor context. */
export const readJsTsResolutionConfig = (
  context: ExtractorContext,
): JsTsResolutionConfig => {
  const { resolutionConfig } = context;
  const baseUrlValue = resolutionConfig[JS_TS_RESOLUTION_CONFIG_KEYS.baseUrl];
  const pathsValue = resolutionConfig[JS_TS_RESOLUTION_CONFIG_KEYS.tsconfigPaths];

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
    const replacement = replacements[0];
    if (!replacement) {
      continue;
    }

    const replacementWildcardIndex = replacement.indexOf("*");
    if (replacementWildcardIndex === -1) {
      return normalizeRepoPath(replacement);
    }
    const resolved = `${replacement.slice(0, replacementWildcardIndex)}${matchedSegment}${replacement.slice(replacementWildcardIndex + 1)}`;
    return normalizeRepoPath(resolved);
  }

  return null;
};

const resolveExtensionlessPath = (basePath: string): string => {
  const normalized = normalizeRepoPath(basePath);
  if (hasKnownExtension(normalized)) {
    return normalized;
  }

  return `${normalized}.ts`;
};

const resolveAsModuleFile = (candidatePath: string): string | null => {
  const normalized = normalizeRepoPath(candidatePath);
  if (hasKnownExtension(normalized)) {
    return normalized;
  }

  return resolveExtensionlessPath(normalized);
};

const resolveRelativeSpecifier = (
  fromFile: string,
  specifier: string,
): string | null => {
  const fromDirectory = dirname(normalizeRepoPath(fromFile));
  const joinedPath = normalizeRepoPath(posix.join(fromDirectory, specifier));
  const asFile = resolveAsModuleFile(joinedPath);
  if (asFile) {
    return asFile;
  }

  const indexPath = posix.join(joinedPath, "index.ts");
  return resolveExtensionlessPath(indexPath);
};

/**
 * Resolve a module specifier from a JS/TS file to a repo-relative path.
 * @returns null for bare package imports and other unresolved specifiers.
 */
export const resolveJsTsSpecifier = (
  fromFile: string,
  specifier: string,
  resolutionConfig: JsTsResolutionConfig,
): string | null => {
  const normalizedFromFile = normalizeRepoPath(fromFile);

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return resolveRelativeSpecifier(normalizedFromFile, specifier);
  }

  if (resolutionConfig.tsconfigPaths) {
    const mappedPath = applyTsconfigPathMapping(specifier, resolutionConfig.tsconfigPaths);
    if (mappedPath) {
      return resolveAsModuleFile(mappedPath);
    }
  }

  if (resolutionConfig.baseUrl) {
    const fromBaseUrl = posix.join(resolutionConfig.baseUrl, specifier);
    return resolveAsModuleFile(fromBaseUrl);
  }

  return null;
};
