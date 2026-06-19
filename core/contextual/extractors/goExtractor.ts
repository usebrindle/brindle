/**
 * Go static import extractor (v2).
 *
 * Parses string-literal import paths and resolves internal module paths using
 * the root go.mod module directive.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import { extractGoImportSpecifiers } from "./goImportScan.js";
import { normalizeForwardSlashes } from "../pathNormalize.js";
import {
  readGoResolutionConfig,
  resolveGoImportToRepoFile,
  resolveGoSpecifier,
} from "./goPathResolution.js";
import type { DependencyEdge, DependencyExtractor, ExtractorContext } from "./types.js";

const GO_EXTENSIONS = [".go"] as const;

const extractGoEdges = (
  filePath: string,
  fileText: string,
  context: ExtractorContext,
): readonly DependencyEdge[] => {
  const normalizedFilePath = normalizeForwardSlashes(filePath);
  const { modulePath } = readGoResolutionConfig(context);
  const importSpecifiers = extractGoImportSpecifiers(fileText);
  const edges: DependencyEdge[] = [];

  for (const importSpecifier of importSpecifiers) {
    const resolvedTarget = resolveGoImportToRepoFile(importSpecifier, modulePath);
    if (!resolvedTarget) {
      continue;
    }

    edges.push({
      from: normalizedFilePath,
      to: resolvedTarget,
      kind: "go_import",
    });
  }

  return edges;
};

const resolveGoModuleSpecifier = (
  fromFile: string,
  specifier: string,
  context: ExtractorContext,
): string | null => resolveGoSpecifier(fromFile, specifier, context);

/** Go extractor for static string-literal import paths. */
export const goExtractor: DependencyExtractor = {
  id: "go",
  fileExtensions: GO_EXTENSIONS,
  extractEdges: extractGoEdges,
  resolveSpecifier: resolveGoModuleSpecifier,
};
