/**
 * Static limitation strings merged into contextual evidence reports per extractor.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */

/** Limitation lines for the js_ts extractor when enabled. */
export const JS_TS_EXTRACTOR_LIMITATIONS = [
  "js_ts: static ESM imports and literal require() only; dynamic require and computed import paths excluded",
  "js_ts: root tsconfig/jsconfig paths and baseUrl only; bundler-only aliases and nested package tsconfigs excluded",
] as const;

/** Limitation lines for the stylesheet extractor when enabled. */
export const STYLESHEET_EXTRACTOR_LIMITATIONS = [
  "stylesheet: @import, @use, and @forward (quoted) and url() imports only; HTML link and CSS-in-JS excluded",
  "stylesheet: Sass partial/index resolution in-repo only; built-in sass:* modules produce no graph edge",
] as const;

/** Limitation lines for the go extractor when enabled. */
export const GO_EXTRACTOR_LIMITATIONS = [
  "go: static import string literals only; cgo dynamic loading and embed excluded",
  "go: module path from root go.mod only; stdlib and external module imports produce no graph edge",
  "go: build tags, generated protobuf paths outside the module, and build-time-only imports excluded",
] as const;

const EXTRACTOR_LIMITATIONS_BY_ID: Readonly<Record<string, readonly string[]>> = {
  js_ts: JS_TS_EXTRACTOR_LIMITATIONS,
  stylesheet: STYLESHEET_EXTRACTOR_LIMITATIONS,
  go: GO_EXTRACTOR_LIMITATIONS,
};

/**
 * @param enabledExtractorIds - Extractor ids that ran during hydration.
 * @returns Merged limitation strings for the contextual evidence report.
 */
export const limitationsForEnabledExtractors = (
  enabledExtractorIds: readonly string[],
): readonly string[] => {
  const mergedLimitations: string[] = [];
  for (const extractorId of enabledExtractorIds) {
    const extractorLimitations = EXTRACTOR_LIMITATIONS_BY_ID[extractorId];
    if (extractorLimitations) {
      mergedLimitations.push(...extractorLimitations);
    }
  }
  return mergedLimitations;
};
