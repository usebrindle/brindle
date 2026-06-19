/**
 * JavaScript/TypeScript static import and require extractor (v1).
 *
 * Parses ESM imports, export-from, and static-literal require() using @babel/parser.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import type { DependencyEdge, DependencyExtractor, ExtractorContext } from "./types.js";
import { extractStaticJsTsReferences } from "./jsTsImportScan.js";
import { readJsTsResolutionConfig, resolveJsTsSpecifier } from "./jsTsPathResolution.js";

const JS_TS_EXTENSIONS = [
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
] as const;

const normalizeForwardSlashes = (filePath: string): string => filePath.replace(/\\/g, "/");

const extractJsTsEdges = (
  filePath: string,
  fileText: string,
  context: ExtractorContext,
): readonly DependencyEdge[] => {
  const normalizedFilePath = normalizeForwardSlashes(filePath);
  const resolutionConfig = readJsTsResolutionConfig(context);
  const references = extractStaticJsTsReferences(normalizedFilePath, fileText);
  const edges: DependencyEdge[] = [];

  for (const reference of references) {
    const resolvedTarget = resolveJsTsSpecifier(
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

const resolveJsTsModuleSpecifier = (
  fromFile: string,
  specifier: string,
  context: ExtractorContext,
): string | null =>
  resolveJsTsSpecifier(
    normalizeForwardSlashes(fromFile),
    specifier,
    readJsTsResolutionConfig(context),
  );

/** v1 JS/TS extractor for static ESM imports and literal require(). */
export const jsTsExtractor: DependencyExtractor = {
  id: "js_ts",
  fileExtensions: JS_TS_EXTENSIONS,
  extractEdges: extractJsTsEdges,
  resolveSpecifier: resolveJsTsModuleSpecifier,
};
