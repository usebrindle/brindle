/**
 * JSON-safe serializers for contextual evidence (Date fields on familiarity findings).
 *
 * @see docs/designs/lld-author-familiarity-criterion.md
 */

import type { ContextualEvidenceSnapshot, FamiliarityFinding } from "./contextual.types.js";
import { isContextualEvidenceSnapshot, isFamiliarityFinding } from "./guards.js";

/** Familiarity finding with {@link FamiliarityFinding.lastTouchDate} as ISO-8601 or null. */
export type SerializedFamiliarityFinding = Omit<FamiliarityFinding, "lastTouchDate"> & {
  lastTouchDate: string | null;
};

/** Snapshot with serialized familiarity findings for criterion detail or logs. */
export type SerializedContextualEvidenceSnapshot = Omit<
  ContextualEvidenceSnapshot,
  "familiarityFindings"
> & {
  familiarityFindings: readonly SerializedFamiliarityFinding[];
};

/** Converts one finding to a JSON-safe shape (ISO date string). */
export const serializeFamiliarityFinding = (finding: FamiliarityFinding): SerializedFamiliarityFinding => ({
  ...finding,
  lastTouchDate: finding.lastTouchDate === null ? null : finding.lastTouchDate.toISOString(),
});

/** Parses ISO `lastTouchDate` back to a {@link Date} for in-memory use. */
export const deserializeFamiliarityFinding = (serialized: SerializedFamiliarityFinding): FamiliarityFinding => ({
  ...serialized,
  lastTouchDate:
    serialized.lastTouchDate === null ? null : new Date(serialized.lastTouchDate),
});

/** Serializes familiarity findings on a contextual evidence snapshot. */
export const serializeContextualEvidenceSnapshot = (
  snapshot: ContextualEvidenceSnapshot,
): SerializedContextualEvidenceSnapshot => ({
  ...snapshot,
  familiarityFindings: snapshot.familiarityFindings.map(serializeFamiliarityFinding),
});

/** Restores Date fields after JSON parse; returns null when shape is invalid. */
export const deserializeContextualEvidenceSnapshot = (
  serialized: unknown,
): ContextualEvidenceSnapshot | null => {
  if (serialized === null || typeof serialized !== "object") return null;
  const candidate = serialized as Record<string, unknown>;
  if (!Array.isArray(candidate.familiarityFindings)) return null;

  const familiarityFindings: FamiliarityFinding[] = [];
  for (const entry of candidate.familiarityFindings) {
    if (entry === null || typeof entry !== "object") return null;
    const row = entry as Record<string, unknown>;
    if (typeof row.lastTouchDate !== "string" && row.lastTouchDate !== null) return null;
    const withDate: SerializedFamiliarityFinding = {
      ...(row as Omit<SerializedFamiliarityFinding, "lastTouchDate">),
      lastTouchDate: row.lastTouchDate,
    };
    const restored = deserializeFamiliarityFinding(withDate);
    if (!isFamiliarityFinding(restored)) return null;
    familiarityFindings.push(restored);
  }

  const partialSnapshot = {
    familiarityFindings,
    blastRadiusFindings: candidate.blastRadiusFindings,
    notAnalyzedForBlastRadius: candidate.notAnalyzedForBlastRadius,
    limitations: candidate.limitations,
    enabledExtractors: candidate.enabledExtractors,
  };

  return isContextualEvidenceSnapshot(partialSnapshot) ? partialSnapshot : null;
};
