/**
 * Runtime type guards for hydrated contextual evidence payloads.
 *
 * Used at adapter boundaries and when validating criterion detail objects.
 *
 * @see docs/designs/lld-contextual-evidence-overview.md
 */

import type {
  BlastRadiusCharacterization,
  BlastRadiusFinding,
  ContextualCharacterization,
  ContextualEvidenceSnapshot,
  FamiliarityFinding,
  FileChangeKind,
  NotAnalyzedForBlastRadius,
} from "./contextual.types.js";

const FAMILIARITY_CHARACTERIZATIONS: readonly ContextualCharacterization[] = ["high", "moderate", "none"];
const BLAST_RADIUS_CHARACTERIZATIONS: readonly BlastRadiusCharacterization[] = ["isolated", "moderate", "broad"];
const FILE_CHANGE_KINDS: readonly FileChangeKind[] = ["added", "modified"];

const isNonNegativeFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

const isDateOrNull = (value: unknown): value is Date | null =>
  value === null || value instanceof Date;

const isFileChangeKind = (value: unknown): value is FileChangeKind =>
  typeof value === "string" && (FILE_CHANGE_KINDS as readonly string[]).includes(value);

const isFamiliarityCharacterization = (value: unknown): value is ContextualCharacterization =>
  typeof value === "string" && (FAMILIARITY_CHARACTERIZATIONS as readonly string[]).includes(value);

const isBlastRadiusCharacterization = (value: unknown): value is BlastRadiusCharacterization =>
  typeof value === "string" && (BLAST_RADIUS_CHARACTERIZATIONS as readonly string[]).includes(value);

/** Returns true when `value` matches the {@link FamiliarityFinding} contract. */
export const isFamiliarityFinding = (value: unknown): value is FamiliarityFinding => {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.touchedFile === "string" &&
    isFileChangeKind(candidate.changeKind) &&
    isNonNegativeFiniteNumber(candidate.authorOwnedLineCount) &&
    isNonNegativeFiniteNumber(candidate.totalBlameableLineCount) &&
    isNonNegativeFiniteNumber(candidate.shareOfCurrentContent) &&
    isNonNegativeFiniteNumber(candidate.authorChangedLineCount) &&
    isNonNegativeFiniteNumber(candidate.totalChangedLineCount) &&
    isNonNegativeFiniteNumber(candidate.shareOfWindowedLineChurn) &&
    isNonNegativeFiniteNumber(candidate.authorCommitCount) &&
    isNonNegativeFiniteNumber(candidate.totalFileCommitCount) &&
    isDateOrNull(candidate.lastTouchDate) &&
    isNonNegativeFiniteNumber(candidate.shareOfFileCommitChurn) &&
    isFamiliarityCharacterization(candidate.characterization)
  );
};

/** Returns true when `value` matches the {@link BlastRadiusFinding} contract. */
export const isBlastRadiusFinding = (value: unknown): value is BlastRadiusFinding => {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.changedFile === "string" &&
    isNonNegativeFiniteNumber(candidate.directDependentCount) &&
    isStringArray(candidate.directDependents) &&
    isNonNegativeFiniteNumber(candidate.transitiveReachCount) &&
    isBlastRadiusCharacterization(candidate.characterization)
  );
};

const isNotAnalyzedForBlastRadius = (value: unknown): value is NotAnalyzedForBlastRadius => {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.path === "string" && typeof candidate.reason === "string";
};

/** Returns true when `value` matches the {@link ContextualEvidenceSnapshot} contract. */
export const isContextualEvidenceSnapshot = (value: unknown): value is ContextualEvidenceSnapshot => {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.familiarityFindings) &&
    candidate.familiarityFindings.every(isFamiliarityFinding) &&
    Array.isArray(candidate.blastRadiusFindings) &&
    candidate.blastRadiusFindings.every(isBlastRadiusFinding) &&
    Array.isArray(candidate.notAnalyzedForBlastRadius) &&
    candidate.notAnalyzedForBlastRadius.every(isNotAnalyzedForBlastRadius) &&
    isStringArray(candidate.limitations) &&
    isStringArray(candidate.enabledExtractors)
  );
};
