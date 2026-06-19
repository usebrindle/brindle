/**
 * Per-file blast-radius detail line for Contextual evidence markdown.
 *
 * @see docs/designs/lld-contextual-evidence-reporting.md
 * @see docs/designs/lld-blast-radius-criterion.md
 */
import type { BlastRadiusFinding } from "../contextual.types.js";

/**
 * @param finding - Single per-file blast-radius finding from hydration.
 * @returns Detail sentence leading with transitive reach; uses "files" not "modules".
 */
export const formatBlastRadiusDetail = (finding: BlastRadiusFinding): string => {
  const transitiveReach = finding.transitiveReachCount;
  const directDependents = finding.directDependentCount;
  const sampleDependent = finding.directDependents[0];
  const includingSample = sampleDependent ? `, including \`${sampleDependent}\`` : "";

  if (transitiveReach !== directDependents) {
    const directLabel =
      directDependents === 1 ? "1 direct importer" : `${directDependents} direct importers`;
    return `Reach: ${transitiveReach} files transitively (${directLabel})${includingSample}.`;
  }

  return `Depended on by ${transitiveReach} file(s)${includingSample}.`;
};
