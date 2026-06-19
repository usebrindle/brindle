/**
 * Pure path resolution for Rust `mod` and `use` declarations within workspace crates.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import { isRustStdCratePath, splitUsePathSegments } from "./rustModUseScan.js";
import { normalizeRepoPath } from "../pathNormalize.js";
import {
  RUST_RESOLUTION_CONFIG_KEYS,
  type RustCrateRoot,
  type RustResolutionConfig,
} from "./rustExtractor.types.js";
import type { ExtractorContext } from "./types.js";

const normalizeRustRepoPath = (filePath: string): string =>
  normalizeRepoPath(filePath).replace(/\/$/, "");

const joinRepoPath = (...segments: readonly string[]): string => {
  const joinedPath = segments
    .filter((segment) => segment.length > 0)
    .join("/")
    .replace(/\/+/g, "/");
  return normalizeRustRepoPath(joinedPath);
};

const splitPathSegments = (filePath: string): readonly string[] =>
  normalizeRustRepoPath(filePath).split("/").filter((segment) => segment.length > 0);

const isRustCrateRoot = (value: unknown): value is RustCrateRoot => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<RustCrateRoot>;
  return (
    typeof candidate.memberPath === "string" &&
    typeof candidate.packageName === "string" &&
    typeof candidate.sourceRoot === "string"
  );
};

/** Read rust resolution hints from the shared extractor context. */
export const readRustResolutionConfig = (context: ExtractorContext): RustResolutionConfig => {
  const crateRootsValue = context.resolutionConfig[RUST_RESOLUTION_CONFIG_KEYS.crateRoots];
  if (!Array.isArray(crateRootsValue) || crateRootsValue.length === 0) {
    return { crateRoots: [] };
  }

  const crateRoots = crateRootsValue.filter(isRustCrateRoot).map((crateRoot) => ({
    memberPath: normalizeRustRepoPath(crateRoot.memberPath),
    packageName: crateRoot.packageName,
    sourceRoot: normalizeRustRepoPath(crateRoot.sourceRoot),
  }));

  return { crateRoots };
};

const relativePathWithinSourceRoot = (
  fromFile: string,
  sourceRoot: string,
): string | null => {
  const normalizedFromFile = normalizeRustRepoPath(fromFile);
  const normalizedSourceRoot = normalizeRustRepoPath(sourceRoot);
  const sourceRootPrefix = `${normalizedSourceRoot}/`;
  if (normalizedFromFile === normalizedSourceRoot) {
    return "";
  }
  if (!normalizedFromFile.startsWith(sourceRootPrefix)) {
    return null;
  }
  return normalizedFromFile.slice(sourceRootPrefix.length);
};

const modulePathSegmentsFromRelativePath = (relativePath: string): readonly string[] => {
  if (relativePath === "lib.rs" || relativePath === "main.rs") {
    return [];
  }
  if (relativePath.endsWith("/mod.rs")) {
    return splitPathSegments(relativePath.slice(0, -"/mod.rs".length));
  }
  if (relativePath.endsWith(".rs")) {
    return splitPathSegments(relativePath.slice(0, -".rs".length));
  }
  return [];
};

const modulePathSegmentsForFile = (
  fromFile: string,
  sourceRoot: string,
): readonly string[] | null => {
  const relativePath = relativePathWithinSourceRoot(fromFile, sourceRoot);
  if (relativePath === null) {
    return null;
  }
  return modulePathSegmentsFromRelativePath(relativePath);
};

const moduleBaseDirectoryForSegments = (
  sourceRoot: string,
  modulePathSegments: readonly string[],
): string => joinRepoPath(sourceRoot, ...modulePathSegments);

const moduleFileFromBaseDirectory = (baseDirectory: string, moduleName: string): string =>
  joinRepoPath(baseDirectory, `${moduleName}.rs`);

const moduleFileFromPathSegments = (
  sourceRoot: string,
  modulePathSegments: readonly string[],
): string => {
  if (modulePathSegments.length === 0) {
    return joinRepoPath(sourceRoot, "lib.rs");
  }
  return joinRepoPath(sourceRoot, `${modulePathSegments.join("/")}.rs`);
};

const findContainingCrateRoot = (
  fromFile: string,
  crateRoots: readonly RustCrateRoot[],
): RustCrateRoot | null => {
  const normalizedFromFile = normalizeRustRepoPath(fromFile);
  let bestMatch: RustCrateRoot | null = null;
  let bestMatchLength = -1;

  for (const crateRoot of crateRoots) {
    const sourceRootPrefix = `${normalizeRustRepoPath(crateRoot.sourceRoot)}/`;
    const isWithinSourceRoot =
      normalizedFromFile === normalizeRustRepoPath(crateRoot.sourceRoot) ||
      normalizedFromFile.startsWith(sourceRootPrefix);
    if (!isWithinSourceRoot) {
      continue;
    }

    const matchLength = normalizeRustRepoPath(crateRoot.sourceRoot).length;
    if (matchLength > bestMatchLength) {
      bestMatch = crateRoot;
      bestMatchLength = matchLength;
    }
  }

  return bestMatch;
};

const findCrateRootByPackageName = (
  packageName: string,
  crateRoots: readonly RustCrateRoot[],
): RustCrateRoot | null =>
  crateRoots.find((crateRoot) => crateRoot.packageName === packageName) ?? null;

const resolveRelativeUsePathSegments = (
  prefix: "self" | "super" | "crate",
  pathSegments: readonly string[],
  fromFile: string,
  sourceRoot: string,
): readonly string[] | null => {
  const currentModuleSegments = modulePathSegmentsForFile(fromFile, sourceRoot);
  if (currentModuleSegments === null) {
    return null;
  }

  if (prefix === "crate") {
    return pathSegments;
  }

  if (prefix === "self") {
    return [...currentModuleSegments, ...pathSegments];
  }

  if (prefix === "super") {
    if (currentModuleSegments.length === 0) {
      return null;
    }
    const parentSegments = currentModuleSegments.slice(0, -1);
    if (pathSegments.length === 0) {
      return parentSegments;
    }
    return [...parentSegments, ...pathSegments];
  }

  return null;
};

/**
 * Resolve a `mod name;` declaration to a canonical repo-relative `.rs` file.
 *
 * Prefers `{base}/{name}.rs` over `{base}/{name}/mod.rs` for graph keys.
 */
export const resolveRustModToRepoFile = (
  fromFile: string,
  moduleName: string,
  crateRoots: readonly RustCrateRoot[],
): string | null => {
  const containingCrateRoot = findContainingCrateRoot(fromFile, crateRoots);
  if (!containingCrateRoot) {
    return null;
  }

  const modulePathSegments = modulePathSegmentsForFile(
    fromFile,
    containingCrateRoot.sourceRoot,
  );
  if (modulePathSegments === null) {
    return null;
  }

  const baseDirectory = moduleBaseDirectoryForSegments(
    containingCrateRoot.sourceRoot,
    modulePathSegments,
  );
  return moduleFileFromBaseDirectory(baseDirectory, moduleName);
};

/**
 * Resolve a `use` path to a canonical repo-relative module `.rs` file.
 *
 * Workspace crate names map to member `src` roots; stdlib and external crates return null.
 */
export const resolveRustUsePathToRepoFile = (
  usePath: string,
  fromFile: string,
  crateRoots: readonly RustCrateRoot[],
): string | null => {
  if (isRustStdCratePath(usePath)) {
    return null;
  }

  const pathSegments = splitUsePathSegments(usePath);
  if (pathSegments.length === 0) {
    return null;
  }

  const containingCrateRoot = findContainingCrateRoot(fromFile, crateRoots);
  if (!containingCrateRoot) {
    return null;
  }

  const firstSegment = pathSegments[0];
  if (!firstSegment) {
    return null;
  }

  if (firstSegment === "crate") {
    const moduleSegments = pathSegments.slice(1);
    if (moduleSegments.length === 0) {
      return moduleFileFromPathSegments(containingCrateRoot.sourceRoot, []);
    }
    return moduleFileFromPathSegments(containingCrateRoot.sourceRoot, moduleSegments);
  }

  if (firstSegment === "self" || firstSegment === "super") {
    const resolvedSegments = resolveRelativeUsePathSegments(
      firstSegment,
      pathSegments.slice(1),
      fromFile,
      containingCrateRoot.sourceRoot,
    );
    if (!resolvedSegments || resolvedSegments.length === 0) {
      return null;
    }
    return moduleFileFromPathSegments(containingCrateRoot.sourceRoot, resolvedSegments);
  }

  const workspaceCrateRoot = findCrateRootByPackageName(firstSegment, crateRoots);
  if (!workspaceCrateRoot) {
    return null;
  }

  const moduleSegments = pathSegments.slice(1);
  if (moduleSegments.length === 0) {
    return moduleFileFromPathSegments(workspaceCrateRoot.sourceRoot, []);
  }
  return moduleFileFromPathSegments(workspaceCrateRoot.sourceRoot, moduleSegments);
};

/**
 * @param fromFile - Repo-relative importer path.
 * @param specifier - Module name (`mod`) or full `use` path string.
 * @param context - Extractor context with hydrated `crateRoots`.
 * @returns Repo-relative target `.rs` path, or null when external/unresolvable.
 */
export const resolveRustSpecifier = (
  fromFile: string,
  specifier: string,
  context: ExtractorContext,
): string | null => {
  const { crateRoots } = readRustResolutionConfig(context);
  if (crateRoots.length === 0) {
    return null;
  }

  if (!specifier.includes("::")) {
    return resolveRustModToRepoFile(fromFile, specifier, crateRoots);
  }

  return resolveRustUsePathToRepoFile(specifier, fromFile, crateRoots);
};
