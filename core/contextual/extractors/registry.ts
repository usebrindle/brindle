/**
 * Registry for pluggable dependency extractors keyed by id and file extension.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import type { DependencyExtractor } from "./types.js";

/** Default v1-shipped ids when config omits `enabled_extractors`. */
export const DEFAULT_V1_EXTRACTOR_IDS = ["js_ts", "stylesheet"] as const;

export interface ExtractorRegistry {
  /** All built-in extractors shipped with merge-risk-core. */
  readonly builtIns: readonly DependencyExtractor[];
  /** Lookup by stable extractor id. */
  getById(id: string): DependencyExtractor | undefined;
  /** Lookup extractor responsible for a file path (by extension). */
  getForFile(filePath: string): DependencyExtractor | undefined;
}

const fileExtensionFromPath = (filePath: string): string | undefined => {
  const lastDotIndex = filePath.lastIndexOf(".");
  if (lastDotIndex <= 0 || lastDotIndex === filePath.length - 1) {
    return undefined;
  }
  return filePath.slice(lastDotIndex).toLowerCase();
};

const indexExtractorsByExtension = (
  extractors: readonly DependencyExtractor[],
): ReadonlyMap<string, DependencyExtractor> => {
  const extensionToExtractor = new Map<string, DependencyExtractor>();
  for (const extractor of extractors) {
    for (const fileExtension of extractor.fileExtensions) {
      const normalizedExtension = fileExtension.toLowerCase();
      if (!extensionToExtractor.has(normalizedExtension)) {
        extensionToExtractor.set(normalizedExtension, extractor);
      }
    }
  }
  return extensionToExtractor;
};

/**
 * @param extractors - Built-in or custom extractors to register (first wins on extension overlap).
 */
export const createExtractorRegistry = (
  extractors: readonly DependencyExtractor[],
): ExtractorRegistry => {
  const extractorsById = new Map(extractors.map((extractor) => [extractor.id, extractor]));
  const extractorsByExtension = indexExtractorsByExtension(extractors);

  return {
    builtIns: extractors,
    getById: (id) => extractorsById.get(id),
    getForFile: (filePath) => {
      const fileExtension = fileExtensionFromPath(filePath);
      if (!fileExtension) {
        return undefined;
      }
      return extractorsByExtension.get(fileExtension);
    },
  };
};
