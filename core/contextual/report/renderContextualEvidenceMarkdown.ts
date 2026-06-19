/**
 * Renders Contextual evidence markdown body (no `<details>` wrapper).
 *
 * @see docs/designs/lld-contextual-evidence-reporting.md
 */
import type { ContextualEvidencePayload, RenderContextualEvidenceMarkdownOptions } from "./contextualEvidenceReport.types.js";
import { describeHistoryWindowBeforePr } from "./describeHistoryWindow.js";
import { formatBlastRadiusDetail } from "./formatBlastRadiusDetail.js";
import { formatContextualEvidencePath } from "./formatContextualPath.js";
import { formatFamiliarityDetail } from "./formatFamiliarityDetail.js";
import { sortBlastRadiusFindingsForReport, sortFamiliarityFindingsForReport } from "./sortFindingsForReport.js";

const renderChangedFilesSection = (changedFiles: readonly string[]): string => {
  const lines = changedFiles.map(
    (filePath) => `  ${formatContextualEvidencePath(filePath)}`,
  );
  return `Changed files (${changedFiles.length}):\n${lines.join("\n")}`;
};

const renderFamiliaritySection = (
  payload: ContextualEvidencePayload,
  renderOptions: RenderContextualEvidenceMarkdownOptions,
): string => {
  const historyWindowDays = renderOptions.historyWindowDays ?? payload.historyWindowDays ?? 180;
  const classifiedAt =
    renderOptions.classifiedAt ??
    (payload.classifiedAtIso ? new Date(payload.classifiedAtIso) : new Date());
  const familiarityOptions = { historyWindowDays, classifiedAt };
  const sortedFindings = sortFamiliarityFindingsForReport(payload.familiarity);

  const findingLines = sortedFindings.flatMap((finding) => [
    `\`${formatContextualEvidencePath(finding.touchedFile)}\` — ${finding.characterization}`,
    `  ${formatFamiliarityDetail(finding, familiarityOptions)}`,
  ]);

  const header = `### Familiarity\nHow familiar the author was with each changed file **before this PR** (last ${historyWindowDays} days).`;

  if (findingLines.length === 0) {
    return `${header}\n\nNo familiarity findings.`;
  }

  return `${header}\n\n${findingLines.join("\n\n")}`;
};

const renderBlastRadiusSection = (payload: ContextualEvidencePayload): string => {
  const sortedFindings = sortBlastRadiusFindingsForReport(payload.blastRadius);
  const findingLines = sortedFindings.flatMap((finding) => [
    `\`${formatContextualEvidencePath(finding.changedFile)}\` — ${finding.characterization}`,
    `  ${formatBlastRadiusDetail(finding)}`,
  ]);

  const header =
    "### Blast radius\nStatic dependency reach for changed source files (transitive reach characterizes breadth).";

  if (findingLines.length === 0) {
    return `${header}\n\nNo blast-radius findings.`;
  }

  return `${header}\n\n${findingLines.join("\n\n")}`;
};

const renderNotAnalyzedSection = (
  notAnalyzedEntries: ContextualEvidencePayload["notAnalyzedForBlastRadius"],
): string | null => {
  if (notAnalyzedEntries.length === 0) {
    return null;
  }

  const lines = notAnalyzedEntries.map(
    (entry) =>
      `  ${formatContextualEvidencePath(entry.path)} — ${entry.reason}`,
  );
  return `### Not analyzed for blast radius\n${lines.join("\n")}`;
};

const renderLimitationsSection = (limitations: readonly string[]): string | null => {
  if (limitations.length === 0) {
    return null;
  }

  const lines = limitations.map((limitation) => `- ${limitation}`);
  return `### Limitations\n${lines.join("\n")}`;
};

/**
 * @param payload - Assembled contextual evidence for one PR.
 * @param options - Optional overrides for history window and classified-at instant.
 * @returns Markdown block for the Contextual evidence section (without `<details>` wrapper).
 */
export const renderContextualEvidenceMarkdown = (
  payload: ContextualEvidencePayload,
  options?: RenderContextualEvidenceMarkdownOptions,
): string => {
  const renderOptions: RenderContextualEvidenceMarkdownOptions = {
    historyWindowDays: options?.historyWindowDays ?? payload.historyWindowDays,
    classifiedAt:
      options?.classifiedAt ??
      (payload.classifiedAtIso ? new Date(payload.classifiedAtIso) : undefined),
  };

  const sections = [
    renderChangedFilesSection(payload.changedFiles),
    renderFamiliaritySection(payload, renderOptions),
    renderBlastRadiusSection(payload),
    renderNotAnalyzedSection(payload.notAnalyzedForBlastRadius),
    renderLimitationsSection(payload.limitations),
  ].filter((section): section is string => section !== null);

  return sections.join("\n\n");
};

/**
 * @param historyWindowDays - Git history window length in days.
 * @returns Human label for familiarity section context (e.g. `6 months`).
 */
export const historyWindowLabelForReport = (historyWindowDays: number): string =>
  describeHistoryWindowBeforePr(historyWindowDays);
