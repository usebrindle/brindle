/**
 * Impure orchestration: walk tracked files, dispatch extractors, build reverse graph.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 * @see docs/adrs/0010-contextual-analysis-at-head.md
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildReverseDependencyGraph } from "../../../core/contextual/extractors/buildReverseDependencyGraph.js";
import type { DependencyEdge, ExtractorContext } from "../../../core/contextual/extractors/types.js";
import { normalizeForwardSlashes } from "../../../core/contextual/pathNormalize.js";

import { classifyNotAnalyzedChangedFile } from "./classifyNotAnalyzedChangedFile.js";
import { limitationsForEnabledExtractors } from "./extractorLimitations.js";
import { listGitTrackedFiles } from "./gitTrackedFiles.js";
import { hydrateResolutionConfig } from "./hydrateResolutionConfig.js";
import type {
  HydrateDependencyGraphDependencies,
  HydrateDependencyGraphInput,
  HydrateDependencyGraphResult,
} from "./hydrateDependencyGraph.types.js";

const defaultReadFileText = (absolutePath: string): string | null => {
  try {
    return readFileSync(absolutePath, "utf8");
  } catch {
    return null;
  }
};

const resolveDependencies = (
  partialDependencies: Partial<HydrateDependencyGraphDependencies> | undefined,
): HydrateDependencyGraphDependencies => ({
  listTrackedFiles: partialDependencies?.listTrackedFiles ?? listGitTrackedFiles,
  readFileText: partialDependencies?.readFileText ?? defaultReadFileText,
  hydrateResolutionConfig:
    partialDependencies?.hydrateResolutionConfig ?? hydrateResolutionConfig,
});

const resolveEnabledExtractors = (
  enabledExtractorIds: readonly string[],
  registry: HydrateDependencyGraphInput["registry"],
): readonly import("../../../core/contextual/extractors/types.js").DependencyExtractor[] => {
  const enabledExtractors = enabledExtractorIds
    .map((extractorId) => registry.getById(extractorId))
    .filter((extractor): extractor is NonNullable<typeof extractor> => extractor !== undefined);

  return enabledExtractors;
};

const shouldDispatchExtractor = (
  filePath: string,
  enabledExtractorIds: readonly string[],
  registry: HydrateDependencyGraphInput["registry"],
): boolean => {
  const extractor = registry.getForFile(filePath);
  return extractor !== undefined && enabledExtractorIds.includes(extractor.id);
};

const extractEdgesForTrackedFile = (
  trackedFilePath: string,
  repoRoot: string,
  extractorContext: ExtractorContext,
  registry: HydrateDependencyGraphInput["registry"],
  enabledExtractorIds: readonly string[],
  readFileText: HydrateDependencyGraphDependencies["readFileText"],
): readonly DependencyEdge[] => {
  const normalizedPath = normalizeForwardSlashes(trackedFilePath);
  if (!shouldDispatchExtractor(normalizedPath, enabledExtractorIds, registry)) {
    return [];
  }

  const extractor = registry.getForFile(normalizedPath);
  if (!extractor) {
    return [];
  }

  const absolutePath = join(repoRoot, normalizedPath);
  const fileText = readFileText(absolutePath);
  if (fileText === null) {
    return [];
  }

  try {
    return extractor.extractEdges(normalizedPath, fileText, extractorContext);
  } catch {
    return [];
  }
};

const collectNotAnalyzedChangedFiles = (
  changedFiles: readonly string[] | undefined,
  enabledExtractorIds: readonly string[],
  registry: HydrateDependencyGraphInput["registry"],
): HydrateDependencyGraphResult["notAnalyzedForBlastRadius"] => {
  if (!changedFiles || changedFiles.length === 0) {
    return [];
  }

  const notAnalyzedEntries = changedFiles
    .map((changedFilePath) =>
      classifyNotAnalyzedChangedFile(changedFilePath, enabledExtractorIds, registry),
    )
    .filter(
      (entry): entry is NonNullable<typeof entry> => entry !== null,
    );

  return notAnalyzedEntries;
};

/**
 * Walk tracked files, run enabled extractors, and build the unified reverse graph.
 *
 * @param input - Repository root, enabled extractor ids, registry, and optional changed paths.
 * @returns Reverse graph, enabled extractor ids that ran, limitations, and not-analyzed changed files.
 */
export const hydrateDependencyGraph = (
  input: HydrateDependencyGraphInput,
): HydrateDependencyGraphResult => {
  const dependencies = resolveDependencies(input.dependencies);
  const enabledExtractors = resolveEnabledExtractors(input.enabledExtractorIds, input.registry);
  const enabledExtractorIds = enabledExtractors.map((extractor) => extractor.id);
  const resolutionConfig = dependencies.hydrateResolutionConfig(input.repoRoot);
  const extractorContext: ExtractorContext = {
    repoRoot: input.repoRoot,
    resolutionConfig,
  };

  const trackedFiles = dependencies.listTrackedFiles(input.repoRoot);
  const forwardEdges: DependencyEdge[] = [];

  for (const trackedFilePath of trackedFiles) {
    const fileEdges = extractEdgesForTrackedFile(
      trackedFilePath,
      input.repoRoot,
      extractorContext,
      input.registry,
      enabledExtractorIds,
      dependencies.readFileText,
    );
    forwardEdges.push(...fileEdges);
  }

  return {
    graph: buildReverseDependencyGraph(forwardEdges),
    enabledExtractors: enabledExtractorIds,
    limitations: limitationsForEnabledExtractors(enabledExtractorIds),
    notAnalyzedForBlastRadius: collectNotAnalyzedChangedFiles(
      input.changedFiles,
      enabledExtractorIds,
      input.registry,
    ),
  };
};
