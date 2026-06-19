/**
 * Rust static `mod` / `use` extractor (v2).
 *
 * Parses file-module declarations and resolvable use paths within workspace crates.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import { extractRustModDeclarations, extractRustUsePaths } from "./rustModUseScan.js";
import { normalizeForwardSlashes } from "../pathNormalize.js";
import {
  readRustResolutionConfig,
  resolveRustModToRepoFile,
  resolveRustUsePathToRepoFile,
  resolveRustSpecifier,
} from "./rustPathResolution.js";
import type { DependencyEdge, DependencyExtractor, ExtractorContext } from "./types.js";

const RUST_EXTENSIONS = [".rs"] as const;

const extractRustEdges = (
  filePath: string,
  fileText: string,
  context: ExtractorContext,
): readonly DependencyEdge[] => {
  const normalizedFilePath = normalizeForwardSlashes(filePath);
  const { crateRoots } = readRustResolutionConfig(context);
  if (crateRoots.length === 0) {
    return [];
  }

  const edges: DependencyEdge[] = [];

  for (const moduleName of extractRustModDeclarations(fileText)) {
    const resolvedTarget = resolveRustModToRepoFile(normalizedFilePath, moduleName, crateRoots);
    if (!resolvedTarget) {
      continue;
    }

    edges.push({
      from: normalizedFilePath,
      to: resolvedTarget,
      kind: "rust_mod",
    });
  }

  for (const usePath of extractRustUsePaths(fileText)) {
    const resolvedTarget = resolveRustUsePathToRepoFile(usePath, normalizedFilePath, crateRoots);
    if (!resolvedTarget) {
      continue;
    }

    edges.push({
      from: normalizedFilePath,
      to: resolvedTarget,
      kind: "rust_use",
    });
  }

  return edges;
};

/** Rust extractor for static `mod` declarations and resolvable `use` paths. */
export const rustExtractor: DependencyExtractor = {
  id: "rust",
  fileExtensions: RUST_EXTENSIONS,
  extractEdges: extractRustEdges,
  resolveSpecifier: resolveRustSpecifier,
};
