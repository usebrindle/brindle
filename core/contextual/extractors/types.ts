/**
 * Port types for pluggable dependency extractors and the unified reverse graph.
 *
 * Extractors emit forward edges (`from` depends on `to`); blast-radius analysis
 * walks the reverse map upward (one hop per entry).
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */

/** Discriminant for how an importer references a target (per extractor / language). */
export type DependencyEdgeKind =
  | "static_import"
  | "static_require"
  | "stylesheet_import"
  | "stylesheet_use"
  | "stylesheet_forward"
  | "go_import"
  | "python_import"
  | "rust_mod"
  | "rust_use";

/**
 * Forward dependency edge: `from` statically depends on `to`.
 * Paths are repo-relative with normalized forward slashes.
 */
export interface DependencyEdge {
  from: string;
  to: string;
  kind: DependencyEdgeKind;
}

/**
 * Hydrated once per graph build; passed to every extractor invocation.
 * `resolutionConfig` keys are extractor-specific (tsconfig paths, go.mod module, etc.).
 */
export interface ExtractorContext {
  repoRoot: string;
  resolutionConfig: Readonly<Record<string, unknown>>;
}

/**
 * Language-specific static dependency parser behind a common port.
 * Implementations must be pure — no I/O inside `extractEdges` or `resolveSpecifier`.
 */
export interface DependencyExtractor {
  /** Stable id, e.g. `js_ts`, `stylesheet`, `go`. */
  readonly id: string;
  /** Lowercase extensions with dot, e.g. `.tsx`, `.scss`. */
  readonly fileExtensions: readonly string[];
  /**
   * Extract forward edges from file text. Omit edges when resolution fails.
   */
  extractEdges(
    filePath: string,
    fileText: string,
    context: ExtractorContext,
  ): readonly DependencyEdge[];
  /**
   * Resolve a module specifier from `fromFile` to a repo-relative path.
   * @returns null when static analysis cannot resolve reliably.
   */
  resolveSpecifier(
    fromFile: string,
    specifier: string,
    context: ExtractorContext,
  ): string | null;
}

/** Target path → direct importer paths (one hop). Same contract as demo ImportGraph. */
export type ReverseDependencyGraph = ReadonlyMap<string, readonly string[]>;
