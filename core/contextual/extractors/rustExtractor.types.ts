/**
 * Resolution hints for the rust dependency extractor (hydrated once per graph build).
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */

/** Keys on {@link import("./types.js").ExtractorContext.resolutionConfig} for rust. */
export const RUST_RESOLUTION_CONFIG_KEYS = {
  crateRoots: "crateRoots",
} as const;

/** One workspace member crate used for `mod` / `use` resolution. */
export interface RustCrateRoot {
  /** Repo-relative path to the crate directory (`.` for the repository root crate). */
  memberPath: string;
  /** Cargo package name from the member's `Cargo.toml`. */
  packageName: string;
  /** Repo-relative `src` directory for the crate (typically `{memberPath}/src`). */
  sourceRoot: string;
}

/** Workspace crate roots hydrated from root `Cargo.toml` and member manifests. */
export interface RustResolutionConfig {
  crateRoots: readonly RustCrateRoot[];
}
