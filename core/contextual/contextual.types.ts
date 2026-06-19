/**
 * Shared types for contextual evidence (author familiarity and blast radius).
 *
 * Extended PRContext fields and finding shapes land in US-002; extractor port types in US-003.
 *
 * @see docs/designs/lld-contextual-evidence-overview.md
 */

/** Per-file familiarity or blast-radius characterization tier. */
export type ContextualCharacterization = "high" | "moderate" | "none";

/** Whether a changed path was added or modified relative to merge-base. */
export type FileChangeKind = "added" | "modified";
