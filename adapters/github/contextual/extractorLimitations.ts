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

/** Limitation lines for the python extractor when enabled. */
export const PYTHON_EXTRACTOR_LIMITATIONS = [
  "python: literal import and from-import module paths only; dynamic __import__ and importlib.import_module excluded",
  "python: relative imports and absolute imports under package roots only; stdlib top-level modules produce no graph edge",
  "python: external pip packages and namespace packages without static file mapping excluded",
] as const;

/** Limitation lines for the rust extractor when enabled. */
export const RUST_EXTRACTOR_LIMITATIONS = [
  "rust: file-module `mod name;` and resolvable `use` paths only; inline mod blocks and macro-generated modules excluded",
  "rust: workspace member crates from root Cargo.toml only; stdlib and external crates produce no graph edge",
  "rust: proc-macro re-exports, build.rs generated code, and directory modules resolved to `{name}.rs` canonical paths only",
] as const;

const EXTRACTOR_LIMITATIONS_BY_ID: Readonly<Record<string, readonly string[]>> = {
  js_ts: JS_TS_EXTRACTOR_LIMITATIONS,
  stylesheet: STYLESHEET_EXTRACTOR_LIMITATIONS,
  go: GO_EXTRACTOR_LIMITATIONS,
  python: PYTHON_EXTRACTOR_LIMITATIONS,
  rust: RUST_EXTRACTOR_LIMITATIONS,
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
