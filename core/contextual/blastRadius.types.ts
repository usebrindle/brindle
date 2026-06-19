/**
 * Pure analyzer input for blast-radius over a reverse dependency graph.
 *
 * @see docs/designs/lld-blast-radius-criterion.md
 */
import type { ReverseDependencyGraph } from "./extractors/types.js";

/** Tunable transitive-reach cut points for blast-radius characterization. */
export interface BlastRadiusThresholds {
  /** Inclusive upper bound for `isolated` (default 2). */
  isolatedMax: number;
  /** Inclusive upper bound for `moderate` (default 10). */
  moderateMax: number;
}

/** Input for pure {@link analyzeBlastRadius}. */
export interface BlastRadiusInput {
  changedFiles: readonly string[];
  graph: ReverseDependencyGraph;
  /** Optional override; defaults to isolated ≤2, moderate ≤10. */
  thresholds?: Partial<BlastRadiusThresholds>;
}
