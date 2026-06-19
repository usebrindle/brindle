/**
 * Pure path resolution for Python import specifiers within package roots.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import { parseRelativeModuleSpecifier, isStdlibTopLevelModule } from "./pythonImportScan.js";
import { normalizeRepoPath } from "../pathNormalize.js";
import {
  PYTHON_RESOLUTION_CONFIG_KEYS,
  type PythonResolutionConfig,
} from "./pythonExtractor.types.js";
import type { ExtractorContext } from "./types.js";

const DEFAULT_PACKAGE_ROOTS = ["."] as const;

const normalizePythonRepoPath = (filePath: string): string =>
  normalizeRepoPath(filePath).replace(/\/$/, "");

const splitPathSegments = (filePath: string): string[] =>
  normalizePythonRepoPath(filePath).split("/").filter((segment) => segment.length > 0);

const directoryPathForFile = (filePath: string): string => {
  const segments = splitPathSegments(filePath);
  if (segments.length <= 1) {
    return "";
  }
  return segments.slice(0, -1).join("/");
};

const modulePathToRepoFile = (modulePath: string): string => {
  const normalizedModulePath = modulePath.replace(/^\./, "");
  if (!normalizedModulePath) {
    return "__init__.py";
  }
  return `${normalizedModulePath.replace(/\./g, "/")}.py`;
};

const resolveRelativeModuleToRepoFile = (
  moduleSpecifier: string,
  fromFile: string,
): string | null => {
  const relativeModule = parseRelativeModuleSpecifier(moduleSpecifier);
  if (!relativeModule) {
    return null;
  }

  const fromDirectorySegments = splitPathSegments(directoryPathForFile(fromFile));
  const parentLevels = relativeModule.level - 1;
  if (parentLevels > fromDirectorySegments.length) {
    return null;
  }

  const packageDirectorySegments = fromDirectorySegments.slice(
    0,
    fromDirectorySegments.length - parentLevels,
  );
  const resolvedModulePath = [packageDirectorySegments.join("/"), relativeModule.modulePath]
    .filter((segment) => segment.length > 0)
    .join(".");

  return modulePathToRepoFile(resolvedModulePath);
};

const resolveAbsoluteModuleUnderRoot = (
  moduleSpecifier: string,
  packageRoot: string,
): string | null => {
  const normalizedRoot = normalizeRepoPath(packageRoot);
  const moduleFile = modulePathToRepoFile(moduleSpecifier);
  if (!normalizedRoot || normalizedRoot === ".") {
    return moduleFile;
  }
  return `${normalizedRoot}/${moduleFile}`;
};

/** Read python resolution hints from the shared extractor context. */
export const readPythonResolutionConfig = (
  context: ExtractorContext,
): PythonResolutionConfig => {
  const packageRootsValue = context.resolutionConfig[PYTHON_RESOLUTION_CONFIG_KEYS.packageRoots];
  if (!Array.isArray(packageRootsValue) || packageRootsValue.length === 0) {
    return { packageRoots: DEFAULT_PACKAGE_ROOTS };
  }

  const packageRoots = packageRootsValue
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => normalizeRepoPath(entry));

  return {
    packageRoots: packageRoots.length > 0 ? packageRoots : DEFAULT_PACKAGE_ROOTS,
  };
};

/**
 * Map a Python module specifier to a canonical repo-relative `.py` file.
 *
 * Relative imports resolve from the importer directory; absolute imports search
 * configured package roots (default repository root).
 *
 * @param moduleSpecifier - Absolute (`app.utils`) or relative (`.shared`, `..models`) path.
 * @param fromFile - Repo-relative importer path.
 * @param packageRoots - Repo-relative directories for absolute import resolution.
 * @returns Canonical `.py` path or null when unresolvable.
 */
export const resolvePythonModuleToRepoFile = (
  moduleSpecifier: string,
  fromFile: string,
  packageRoots: readonly string[],
): string | null => {
  const normalizedFromFile = normalizeRepoPath(fromFile);

  if (moduleSpecifier.startsWith(".")) {
    return resolveRelativeModuleToRepoFile(moduleSpecifier, normalizedFromFile);
  }

  if (isStdlibTopLevelModule(moduleSpecifier)) {
    return null;
  }

  for (const packageRoot of packageRoots) {
    const resolvedTarget = resolveAbsoluteModuleUnderRoot(moduleSpecifier, packageRoot);
    if (resolvedTarget) {
      return normalizeRepoPath(resolvedTarget);
    }
  }

  return null;
};

/**
 * @param fromFile - Repo-relative importer path.
 * @param specifier - Module path from a Python import statement.
 * @param context - Extractor context with hydrated `packageRoots`.
 * @returns Repo-relative target `.py` path, or null when external/unresolvable.
 */
export const resolvePythonSpecifier = (
  fromFile: string,
  specifier: string,
  context: ExtractorContext,
): string | null => {
  const { packageRoots } = readPythonResolutionConfig(context);
  return resolvePythonModuleToRepoFile(specifier, fromFile, packageRoots);
};
