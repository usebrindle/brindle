/**
 * Assembles a {@link ContextualEvidencePayload} from hydrated {@link PRContext}.
 *
 * @see docs/designs/lld-contextual-evidence-reporting.md
 */
import type { PRContext } from "../../types.js";
import type { ContextualEvidencePayload } from "./contextualEvidenceReport.types.js";

/**
 * @param pullRequestContext - Hydrated PR context with optional contextual evidence snapshot.
 * @param options - Optional history window for familiarity copy.
 * @returns Payload for report formatters, or `null` when no snapshot is present.
 */
export const buildContextualEvidencePayload = (
  pullRequestContext: PRContext,
  options?: { historyWindowDays?: number },
): ContextualEvidencePayload | null => {
  const snapshot = pullRequestContext.contextualEvidence;
  if (snapshot === undefined) {
    return null;
  }

  return {
    authorLogin: pullRequestContext.author,
    changeNumber: pullRequestContext.changeNumber,
    changedFiles: pullRequestContext.files.map((changedFile) => changedFile.path).sort(),
    familiarity: snapshot.familiarityFindings,
    blastRadius: snapshot.blastRadiusFindings,
    notAnalyzedForBlastRadius: snapshot.notAnalyzedForBlastRadius,
    limitations: snapshot.limitations,
    enabledExtractors: snapshot.enabledExtractors,
    historyWindowDays: options?.historyWindowDays,
    classifiedAtIso: pullRequestContext.classifiedAtIso,
  };
};
