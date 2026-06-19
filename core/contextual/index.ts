/**
 * Contextual evidence: familiarity and blast-radius analyzers, extractors, and report formatters.
 *
 * Pure modules under this tree publish with merge-risk-core (ADR 0010).
 *
 * @see docs/designs/lld-contextual-evidence-overview.md
 */
export type {
  BlastRadiusCharacterization,
  BlastRadiusFinding,
  ContextualCharacterization,
  ContextualEvidenceSnapshot,
  FamiliarityFinding,
  FileChangeKind,
  NotAnalyzedForBlastRadius,
} from "./contextual.types.js";
export {
  isBlastRadiusFinding,
  isContextualEvidenceSnapshot,
  isFamiliarityFinding,
} from "./guards.js";
export {
  deserializeContextualEvidenceSnapshot,
  deserializeFamiliarityFinding,
  serializeContextualEvidenceSnapshot,
  serializeFamiliarityFinding,
} from "./serialization.js";
export type {
  SerializedContextualEvidenceSnapshot,
  SerializedFamiliarityFinding,
} from "./serialization.js";
export { buildReverseDependencyGraph } from "./extractors/index.js";
export type {
  DependencyEdge,
  DependencyEdgeKind,
  DependencyExtractor,
  ExtractorContext,
  ReverseDependencyGraph,
} from "./extractors/index.js";
