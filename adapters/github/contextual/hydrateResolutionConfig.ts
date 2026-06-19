/**
 * Hydrates shared extractor resolution config from root tsconfig/jsconfig.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { GO_RESOLUTION_CONFIG_KEYS } from "../../../core/contextual/extractors/goExtractor.types.js";
import { JS_TS_RESOLUTION_CONFIG_KEYS } from "../../../core/contextual/extractors/jsTsExtractor.types.js";
import { PYTHON_RESOLUTION_CONFIG_KEYS } from "../../../core/contextual/extractors/pythonExtractor.types.js";
import { RUST_RESOLUTION_CONFIG_KEYS } from "../../../core/contextual/extractors/rustExtractor.types.js";
import type { RustCrateRoot } from "../../../core/contextual/extractors/rustExtractor.types.js";

const CONFIG_CANDIDATE_FILENAMES = ["tsconfig.json", "jsconfig.json"] as const;
const GO_MOD_FILENAME = "go.mod";
const PYPROJECT_FILENAME = "pyproject.toml";
const CARGO_MANIFEST_FILENAME = "Cargo.toml";

const normalizeRepoPath = (filePath: string): string =>
  filePath.replace(/\\/g, "/").replace(/^\.\//, "");

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

const readRootCompilerConfig = (
  repoRoot: string,
): { baseUrl?: string; tsconfigPaths?: Readonly<Record<string, readonly string[]>> } => {
  for (const configFilename of CONFIG_CANDIDATE_FILENAMES) {
    const configPath = join(repoRoot, configFilename);
    if (!existsSync(configPath)) {
      continue;
    }

    const parsedConfig: unknown = JSON.parse(readFileSync(configPath, "utf8"));
    if (typeof parsedConfig !== "object" || parsedConfig === null) {
      continue;
    }

    const compilerOptions = (parsedConfig as { compilerOptions?: unknown }).compilerOptions;
    if (typeof compilerOptions !== "object" || compilerOptions === null) {
      continue;
    }

    const baseUrlValue = (compilerOptions as { baseUrl?: unknown }).baseUrl;
    const pathsValue = (compilerOptions as { paths?: unknown }).paths;

    return {
      baseUrl:
        typeof baseUrlValue === "string" ? normalizeRepoPath(baseUrlValue) : undefined,
      tsconfigPaths: isPathsRecord(pathsValue) ? pathsValue : undefined,
    };
  }

  return {};
};

const readPythonPackageRoots = (repoRoot: string): readonly string[] | undefined => {
  const pyprojectPath = join(repoRoot, PYPROJECT_FILENAME);
  if (!existsSync(pyprojectPath)) {
    return undefined;
  }

  const pyprojectText = readFileSync(pyprojectPath, "utf8");
  const whereMatch = pyprojectText.match(/where\s*=\s*\[\s*"([^"]+)"\s*\]/);
  if (whereMatch?.[1]) {
    return [normalizeRepoPath(whereMatch[1])];
  }

  return undefined;
};

const readGoModulePath = (repoRoot: string): string | undefined => {
  const goModPath = join(repoRoot, GO_MOD_FILENAME);
  if (!existsSync(goModPath)) {
    return undefined;
  }

  const goModText = readFileSync(goModPath, "utf8");
  const moduleDirectiveMatch = goModText.match(/^module\s+(\S+)/m);
  if (!moduleDirectiveMatch?.[1]) {
    return undefined;
  }

  return normalizeRepoPath(moduleDirectiveMatch[1]);
};

const readCargoManifestText = (manifestPath: string): string | undefined => {
  if (!existsSync(manifestPath)) {
    return undefined;
  }
  return readFileSync(manifestPath, "utf8");
};

const readCargoPackageName = (cargoManifestText: string): string | undefined => {
  const packageNameMatch = cargoManifestText.match(/^\s*\[package\][\s\S]*?^name\s*=\s*"([^"]+)"/m);
  return packageNameMatch?.[1];
};

const readWorkspaceMemberPaths = (cargoManifestText: string): readonly string[] | undefined => {
  const workspaceMembersMatch = cargoManifestText.match(
    /^\s*\[workspace\][\s\S]*?^members\s*=\s*\[([\s\S]*?)\]/m,
  );
  if (!workspaceMembersMatch?.[1]) {
    return undefined;
  }

  const memberPaths = [...workspaceMembersMatch[1].matchAll(/"([^"]+)"/g)].map(
    (match) => normalizeRepoPath(match[1] ?? ""),
  );
  return memberPaths.length > 0 ? memberPaths : undefined;
};

const readRustCrateRoot = (
  repoRoot: string,
  memberPath: string,
): RustCrateRoot | undefined => {
  const normalizedMemberPath = normalizeRepoPath(memberPath);
  const manifestPath =
    normalizedMemberPath === "."
      ? join(repoRoot, CARGO_MANIFEST_FILENAME)
      : join(repoRoot, normalizedMemberPath, CARGO_MANIFEST_FILENAME);
  const cargoManifestText = readCargoManifestText(manifestPath);
  if (!cargoManifestText) {
    return undefined;
  }

  const packageName = readCargoPackageName(cargoManifestText);
  if (!packageName) {
    return undefined;
  }

  const sourceRoot =
    normalizedMemberPath === "."
      ? "src"
      : normalizeRepoPath(`${normalizedMemberPath}/src`);

  return {
    memberPath: normalizedMemberPath,
    packageName,
    sourceRoot,
  };
};

const readRustCrateRoots = (repoRoot: string): readonly RustCrateRoot[] | undefined => {
  const rootManifestPath = join(repoRoot, CARGO_MANIFEST_FILENAME);
  const rootCargoManifestText = readCargoManifestText(rootManifestPath);
  if (!rootCargoManifestText) {
    return undefined;
  }

  const workspaceMemberPaths = readWorkspaceMemberPaths(rootCargoManifestText);
  const memberPaths =
    workspaceMemberPaths ??
    (readCargoPackageName(rootCargoManifestText) ? (["."] as const) : undefined);
  if (!memberPaths) {
    return undefined;
  }

  const crateRoots = memberPaths
    .map((memberPath) => readRustCrateRoot(repoRoot, memberPath))
    .filter((crateRoot): crateRoot is RustCrateRoot => crateRoot !== undefined);

  return crateRoots.length > 0 ? crateRoots : undefined;
};

/**
 * @param repoRoot - Absolute path to the repository root.
 * @returns Shared `resolutionConfig` keys for js_ts, stylesheet, go, python, and rust extractors.
 */
export const hydrateResolutionConfig = (
  repoRoot: string,
): Readonly<Record<string, unknown>> => {
  const compilerConfig = readRootCompilerConfig(repoRoot);
  const resolutionConfig: Record<string, unknown> = {};

  if (compilerConfig.baseUrl) {
    resolutionConfig[JS_TS_RESOLUTION_CONFIG_KEYS.baseUrl] = compilerConfig.baseUrl;
  }
  if (compilerConfig.tsconfigPaths) {
    resolutionConfig[JS_TS_RESOLUTION_CONFIG_KEYS.tsconfigPaths] =
      compilerConfig.tsconfigPaths;
  }

  const modulePath = readGoModulePath(repoRoot);
  if (modulePath) {
    resolutionConfig[GO_RESOLUTION_CONFIG_KEYS.modulePath] = modulePath;
  }

  const packageRoots = readPythonPackageRoots(repoRoot);
  if (packageRoots) {
    resolutionConfig[PYTHON_RESOLUTION_CONFIG_KEYS.packageRoots] = packageRoots;
  }

  const crateRoots = readRustCrateRoots(repoRoot);
  if (crateRoots) {
    resolutionConfig[RUST_RESOLUTION_CONFIG_KEYS.crateRoots] = crateRoots;
  }

  return resolutionConfig;
};
