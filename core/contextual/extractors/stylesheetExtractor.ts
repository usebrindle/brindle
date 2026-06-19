/**
 * CSS/SCSS/Sass stylesheet dependency extractor (v1).
 *
 * Parses @import, @use, and @forward (quoted and url()) via postcss-scss and
 * postcss-sass, with a line scanner fallback for indented `.sass`.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import { extractStylesheetReferences } from "./stylesheetImportScan.js";
import {
  readStylesheetResolutionConfig,
  resolveStylesheetSpecifier,
} from "./stylesheetPathResolution.js";
import { STYLESHEET_FILE_EXTENSIONS } from "./stylesheetExtractor.types.js";
import type { DependencyEdge, DependencyExtractor, ExtractorContext } from "./types.js";

const normalizeForwardSlashes = (filePath: string): string => filePath.replace(/\\/g, "/");

const extractStylesheetEdges = (
  filePath: string,
  fileText: string,
  context: ExtractorContext,
): readonly DependencyEdge[] => {
  const normalizedFilePath = normalizeForwardSlashes(filePath);
  const resolutionConfig = readStylesheetResolutionConfig(context);
  const references = extractStylesheetReferences(normalizedFilePath, fileText);
  const edges: DependencyEdge[] = [];

  for (const reference of references) {
    const resolvedTarget = resolveStylesheetSpecifier(
      normalizedFilePath,
      reference.specifier,
      resolutionConfig,
    );
    if (!resolvedTarget) {
      continue;
    }

    edges.push({
      from: normalizedFilePath,
      to: resolvedTarget,
      kind: reference.kind,
    });
  }

  return edges;
};

const resolveStylesheetModuleSpecifier = (
  fromFile: string,
  specifier: string,
  context: ExtractorContext,
): string | null =>
  resolveStylesheetSpecifier(
    normalizeForwardSlashes(fromFile),
    specifier,
    readStylesheetResolutionConfig(context),
  );

/** v1 stylesheet extractor for static @import, @use, and @forward edges. */
export const stylesheetExtractor: DependencyExtractor = {
  id: "stylesheet",
  fileExtensions: STYLESHEET_FILE_EXTENSIONS,
  extractEdges: extractStylesheetEdges,
  resolveSpecifier: resolveStylesheetModuleSpecifier,
};
