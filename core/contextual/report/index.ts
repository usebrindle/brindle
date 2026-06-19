/**
 * Markdown formatters for the Contextual evidence PR comment block.
 *
 * @see docs/designs/lld-contextual-evidence-reporting.md
 */
export { buildContextualEvidencePayload } from "./buildContextualEvidencePayload.js";
export { describeHistoryWindowBeforePr } from "./describeHistoryWindow.js";
export type {
  ContextualEvidencePayload,
  FormatFamiliarityDetailOptions,
  RenderContextualEvidenceMarkdownOptions,
} from "./contextualEvidenceReport.types.js";
export { formatBlastRadiusDetail } from "./formatBlastRadiusDetail.js";
export { formatContextualEvidencePath } from "./formatContextualPath.js";
export { formatFamiliarityDetail } from "./formatFamiliarityDetail.js";
export { formatPercentForDisplay } from "./formatPercentForDisplay.js";
export {
  historyWindowLabelForReport,
  renderContextualEvidenceMarkdown,
} from "./renderContextualEvidenceMarkdown.js";
export {
  sortBlastRadiusFindingsForReport,
  sortFamiliarityFindingsForReport,
} from "./sortFindingsForReport.js";
