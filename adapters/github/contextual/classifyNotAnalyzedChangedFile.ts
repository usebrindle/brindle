/**
 * Classifies changed files that cannot receive blast-radius analysis.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import type { NotAnalyzedForBlastRadius } from "../../../core/contextual/contextual.types.js";
import type { ExtractorRegistry } from "../../../core/contextual/extractors/registry.js";

const normalizeForwardSlashes = (filePath: string): string => filePath.replace(/\\/g, "/");

const fileExtensionFromPath = (filePath: string): string | undefined => {
  const lastDotIndex = filePath.lastIndexOf(".");
  if (lastDotIndex <= 0 || lastDotIndex === filePath.length - 1) {
    return undefined;
  }
  return filePath.slice(lastDotIndex).toLowerCase();
};

/**
 * @returns A not-analyzed entry when the changed file has no enabled extractor; otherwise null.
 */
export const classifyNotAnalyzedChangedFile = (
  changedFilePath: string,
  enabledExtractorIds: readonly string[],
  registry: ExtractorRegistry,
): NotAnalyzedForBlastRadius | null => {
  const normalizedPath = normalizeForwardSlashes(changedFilePath);
  const extractor = registry.getForFile(normalizedPath);

  if (!extractor) {
    const fileExtension = fileExtensionFromPath(normalizedPath);
    if (!fileExtension) {
      return {
        path: normalizedPath,
        reason: "no file extension",
      };
    }
    return {
      path: normalizedPath,
      reason: `no extractor for extension ${fileExtension}`,
    };
  }

  if (!enabledExtractorIds.includes(extractor.id)) {
    return {
      path: normalizedPath,
      reason: `extractor disabled: ${extractor.id}`,
    };
  }

  return null;
};
