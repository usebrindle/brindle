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
export type {
  ChangedFileEntry,
  FamiliarityInput,
  GitBlameQuery,
  GitBlameSource,
  GitBlameStats,
  GitHistoryQuery,
  GitHistorySource,
  GitHistoryStats,
} from "./familiarity.types.js";
export type { BlastRadiusInput, BlastRadiusThresholds } from "./blastRadius.types.js";
export {
  analyzeBlastRadius,
  characterizeBlastRadius,
  countDirectImportersForFile,
  countTransitiveReachForFile,
} from "./blastRadius.js";
export {
  analyzeFamiliarity,
  characterizeFamiliarity,
  historyWindowSince,
  shareOfCurrentContent,
  shareOfFileCommitChurn,
  shareOfWindowedLineChurn,
} from "./familiarity.js";
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
export {
  builtInExtractors,
  buildReverseDependencyGraph,
  createExtractorRegistry,
  DEFAULT_V1_EXTRACTOR_IDS,
  defaultExtractorRegistry,
  goExtractor,
  jsTsExtractor,
  stylesheetExtractor,
} from "./extractors/index.js";
export type {
  DependencyEdge,
  DependencyEdgeKind,
  DependencyExtractor,
  ExtractorContext,
  ExtractorRegistry,
  ReverseDependencyGraph,
} from "./extractors/index.js";
export {
  buildContextualEvidencePayload,
  describeHistoryWindowBeforePr,
  formatBlastRadiusDetail,
  formatContextualEvidencePath,
  formatFamiliarityDetail,
  formatPercentForDisplay,
  historyWindowLabelForReport,
  renderContextualEvidenceMarkdown,
  sortBlastRadiusFindingsForReport,
  sortFamiliarityFindingsForReport,
} from "./report/index.js";
export type {
  ContextualEvidencePayload,
  FormatFamiliarityDetailOptions,
  RenderContextualEvidenceMarkdownOptions,
} from "./report/index.js";
