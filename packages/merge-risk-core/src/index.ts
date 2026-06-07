/**
 * npm package entry: re-exports the platform-agnostic core plus the {@link PlatformAdapter} contract.
 * Does not include GitHub/GitLab implementations (see `adapters/github/` in the monorepo).
 *
 * @see docs/adrs/0007-platform-adapter-boundary.md
 */
export * from "../../../core/index.js";
export type { PlatformAdapter } from "../../../adapters/PlatformAdapter.js";
