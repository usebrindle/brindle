/**
 * Input and output types for dependency graph hydration at the GitHub adapter boundary.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import type { NotAnalyzedForBlastRadius } from "../../../core/contextual/contextual.types.js";
import type { ExtractorRegistry } from "../../../core/contextual/extractors/registry.js";
import type { ReverseDependencyGraph } from "../../../core/contextual/extractors/types.js";

/** Impure dependencies injectable for tests (git walk and file reads). */
export interface HydrateDependencyGraphDependencies {
  /** List repo-relative tracked paths via `git ls-files`. */
  listTrackedFiles: (repoRoot: string) => readonly string[];
  /** Read UTF-8 file text; return null when unreadable or missing. */
  readFileText: (absolutePath: string) => string | null;
  /** Hydrate shared `resolutionConfig` for enabled extractors. */
  hydrateResolutionConfig: (repoRoot: string) => Readonly<Record<string, unknown>>;
}

/** Arguments for a single dependency graph hydration run. */
export interface HydrateDependencyGraphInput {
  repoRoot: string;
  enabledExtractorIds: readonly string[];
  registry: ExtractorRegistry;
  /** Changed paths to classify for blast-radius coverage gaps. */
  changedFiles?: readonly string[];
  dependencies?: Partial<HydrateDependencyGraphDependencies>;
}

/** Unified reverse graph plus metadata for blast-radius analysis. */
export interface HydrateDependencyGraphResult {
  graph: ReverseDependencyGraph;
  enabledExtractors: readonly string[];
  limitations: readonly string[];
  notAnalyzedForBlastRadius: readonly NotAnalyzedForBlastRadius[];
}
