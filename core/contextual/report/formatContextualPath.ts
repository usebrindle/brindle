/**
 * Display path for contextual evidence markdown (repository root alias).
 *
 * @see docs/designs/lld-contextual-evidence-reporting.md
 */

/**
 * @param filePath - Repo-relative path from a finding or changed-file list.
 * @returns Human-readable path; `.` becomes `(repository root)`.
 */
export const formatContextualEvidencePath = (filePath: string): string =>
  filePath === "." ? "(repository root)" : filePath;
