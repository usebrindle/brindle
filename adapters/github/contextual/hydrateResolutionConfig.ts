/**
 * Hydrates shared extractor resolution config from root tsconfig/jsconfig.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { GO_RESOLUTION_CONFIG_KEYS } from "../../../core/contextual/extractors/goExtractor.types.js";
import { JS_TS_RESOLUTION_CONFIG_KEYS } from "../../../core/contextual/extractors/jsTsExtractor.types.js";

const CONFIG_CANDIDATE_FILENAMES = ["tsconfig.json", "jsconfig.json"] as const;
const GO_MOD_FILENAME = "go.mod";

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

/**
 * @param repoRoot - Absolute path to the repository root.
 * @returns Shared `resolutionConfig` keys for js_ts, stylesheet, and go extractors.
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

  return resolutionConfig;
};
