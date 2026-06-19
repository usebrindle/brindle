/**
 * Pure path resolution for Go import specifiers using go.mod module path.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import type { ExtractorContext } from "./types.js";
import {
  GO_RESOLUTION_CONFIG_KEYS,
  type GoResolutionConfig,
} from "./goExtractor.types.js";

const normalizeRepoPath = (filePath: string): string =>
  filePath.replace(/\\/g, "/").replace(/^\.\//, "");

/** Read go resolution hints from the shared extractor context. */
export const readGoResolutionConfig = (context: ExtractorContext): GoResolutionConfig => {
  const modulePathValue = context.resolutionConfig[GO_RESOLUTION_CONFIG_KEYS.modulePath];
  return {
    modulePath:
      typeof modulePathValue === "string" ? normalizeRepoPath(modulePathValue) : undefined,
  };
};

const packageDirectoryFromModuleImport = (
  importPath: string,
  modulePath: string,
): string | null => {
  const normalizedModulePath = modulePath.replace(/\/$/, "");
  if (importPath === normalizedModulePath) {
    return null;
  }
  const modulePrefix = `${normalizedModulePath}/`;
  if (!importPath.startsWith(modulePrefix)) {
    return null;
  }

  const packageRelativePath = importPath.slice(modulePrefix.length);
  if (!packageRelativePath || packageRelativePath.includes("..")) {
    return null;
  }
  return normalizeRepoPath(packageRelativePath);
};

/**
 * Map an internal module import path to a canonical repo-relative `.go` file.
 *
 * Uses `{packageDir}/{lastSegment}.go` so reverse-graph keys align with typical
 * single-file package layouts in fixture repos and common Go projects.
 */
export const resolveGoImportToRepoFile = (
  importPath: string,
  modulePath: string | undefined,
): string | null => {
  if (!modulePath) {
    return null;
  }

  const packageDirectory = packageDirectoryFromModuleImport(importPath, modulePath);
  if (!packageDirectory) {
    return null;
  }

  const pathSegments = packageDirectory.split("/");
  const packageName = pathSegments[pathSegments.length - 1];
  return `${packageDirectory}/${packageName}.go`;
};

/**
 * @param fromFile - Repo-relative importer path (unused; Go imports are module paths).
 * @param specifier - Import path string from a Go import declaration.
 * @param context - Extractor context with hydrated `modulePath`.
 * @returns Repo-relative target `.go` path, or null when external/unresolvable.
 */
export const resolveGoSpecifier = (
  _fromFile: string,
  specifier: string,
  context: ExtractorContext,
): string | null => {
  const { modulePath } = readGoResolutionConfig(context);
  return resolveGoImportToRepoFile(specifier, modulePath);
};
