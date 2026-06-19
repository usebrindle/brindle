/**
 * Types for contextual evidence markdown formatters.
 *
 * @see docs/designs/lld-contextual-evidence-reporting.md
 */
import type {
  BlastRadiusFinding,
  FamiliarityFinding,
  NotAnalyzedForBlastRadius,
} from "../contextual.types.js";

/** Payload assembled from hydrated {@link PRContext} for report formatters. */
export interface ContextualEvidencePayload {
  authorLogin: string;
  changeNumber: number;
  changedFiles: readonly string[];
  familiarity: readonly FamiliarityFinding[];
  blastRadius: readonly BlastRadiusFinding[];
  notAnalyzedForBlastRadius: readonly NotAnalyzedForBlastRadius[];
  limitations: readonly string[];
  enabledExtractors: readonly string[];
  /** Git history window for familiarity copy (default 180). */
  historyWindowDays?: number;
  /** ISO instant for relative last-touch phrasing (defaults to now when omitted). */
  classifiedAtIso?: string;
}

/** Options for {@link import("./formatFamiliarityDetail.js").formatFamiliarityDetail}. */
export interface FormatFamiliarityDetailOptions {
  historyWindowDays?: number;
  classifiedAt?: Date;
}

/** Options for {@link import("./renderContextualEvidenceMarkdown.js").renderContextualEvidenceMarkdown}. */
export interface RenderContextualEvidenceMarkdownOptions {
  historyWindowDays?: number;
  classifiedAt?: Date;
}
