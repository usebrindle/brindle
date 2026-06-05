/**
 * YAML shape for opt-in trusted plugin definitions loaded from the base branch only (ADR 0001).
 * Plugin **files** are fetched via the platform adapter; this object only declares **where** they live.
 *
 * **MVP file format (slice 1 contract):** Each path points to a base-branch file interpreted in a later slice
 * by a fixed handler (YAML/JSON, no arbitrary JS from the repo). See slice 2 `loadTrustedPlugins` and ADR 0001.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 */
export interface TrustedPluginsConfiguration {
  /**
   * Repository-relative directory (POSIX-style segments after normalization).
   * Must not normalize to `.` alone — use an explicit folder (e.g. `.merge-risk-plugins`).
   */
  directory: string;
  /**
   * Repository-relative paths to plugin definition files. Each path must normalize to a location
   * strictly inside {@link directory} (no `..` escape, no absolute paths).
   */
  paths: string[];
}
