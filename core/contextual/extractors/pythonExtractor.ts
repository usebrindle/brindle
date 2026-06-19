/**
 * Python static import extractor (v2).
 *
 * Parses literal `import` / `from … import` module paths and resolves them within
 * configured package roots or via relative import rules.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import { extractPythonImportSpecifiers } from "./pythonImportScan.js";
import { normalizeForwardSlashes } from "../pathNormalize.js";
import {
  readPythonResolutionConfig,
  resolvePythonModuleToRepoFile,
  resolvePythonSpecifier,
} from "./pythonPathResolution.js";
import type { DependencyEdge, DependencyExtractor, ExtractorContext } from "./types.js";

const PYTHON_EXTENSIONS = [".py", ".pyi"] as const;

const extractPythonEdges = (
  filePath: string,
  fileText: string,
  context: ExtractorContext,
): readonly DependencyEdge[] => {
  const normalizedFilePath = normalizeForwardSlashes(filePath);
  const { packageRoots } = readPythonResolutionConfig(context);
  const importSpecifiers = extractPythonImportSpecifiers(fileText);
  const edges: DependencyEdge[] = [];

  for (const importSpecifier of importSpecifiers) {
    const resolvedTarget = resolvePythonModuleToRepoFile(
      importSpecifier,
      normalizedFilePath,
      packageRoots,
    );
    if (!resolvedTarget) {
      continue;
    }

    edges.push({
      from: normalizedFilePath,
      to: resolvedTarget,
      kind: "python_import",
    });
  }

  return edges;
};

const resolvePythonModuleSpecifier = (
  fromFile: string,
  specifier: string,
  context: ExtractorContext,
): string | null => resolvePythonSpecifier(fromFile, specifier, context);

/** Python extractor for static literal import and from-import module paths. */
export const pythonExtractor: DependencyExtractor = {
  id: "python",
  fileExtensions: PYTHON_EXTENSIONS,
  extractEdges: extractPythonEdges,
  resolveSpecifier: resolvePythonModuleSpecifier,
};
