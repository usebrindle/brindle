/**
 * Unified contextual evidence hydration: familiarity git sources and blast-radius graph walk.
 *
 * @see docs/designs/lld-contextual-evidence-overview.md
 * @see docs/adrs/0010-contextual-analysis-at-head.md
 */
import { analyzeFamiliarity } from "../../../core/contextual/familiarity.js";
import type { ContextualEvidenceSnapshot } from "../../../core/contextual/contextual.types.js";
import { defaultExtractorRegistry } from "../../../core/contextual/extractors/builtins.js";
import { DEFAULT_V1_EXTRACTOR_IDS } from "../../../core/contextual/extractors/registry.js";

import { createGitBlameSource } from "./createGitBlameSource.js";
import { createGitHistorySource } from "./createGitHistorySource.js";
import { hydrateBlastRadiusContextualEvidence } from "./hydrateBlastRadiusContextualEvidence.js";
import { hydrateFamiliarityPrContext } from "./hydrateFamiliarityPrContext.js";
import type {
  HydrateContextualEvidenceInput,
  HydrateContextualEvidenceResult,
} from "./hydrateContextualEvidence.types.js";

const emptyContextualEvidenceSnapshot = (): ContextualEvidenceSnapshot => ({
  familiarityFindings: [],
  blastRadiusFindings: [],
  notAnalyzedForBlastRadius: [],
  limitations: [],
  enabledExtractors: [],
});

/**
 * Hydrates familiarity and/or blast-radius findings once for {@link PRContext}.
 *
 * Git blame/log runs only when `hydrateAuthorFamiliarity` is true.
 * Graph walk runs only when `hydrateBlastRadius` is true.
 */
export const hydrateContextualEvidence = (
  input: HydrateContextualEvidenceInput,
): HydrateContextualEvidenceResult => {
  if (!input.hydrateAuthorFamiliarity && !input.hydrateBlastRadius) {
    return { contextualEvidence: emptyContextualEvidenceSnapshot() };
  }

  const gitDependencies = input.dependencies;
  let baseRevision: string | undefined;
  let authorEmails: readonly string[] | undefined;
  let familiarityFindings = emptyContextualEvidenceSnapshot().familiarityFindings;
  let blastRadiusFindings = emptyContextualEvidenceSnapshot().blastRadiusFindings;
  let notAnalyzedForBlastRadius = emptyContextualEvidenceSnapshot().notAnalyzedForBlastRadius;
  let limitations = emptyContextualEvidenceSnapshot().limitations;
  let enabledExtractors = emptyContextualEvidenceSnapshot().enabledExtractors;

  if (input.hydrateAuthorFamiliarity) {
    const familiarityPrContext = hydrateFamiliarityPrContext(
      {
        repositoryRoot: input.repositoryRoot,
        baseRef: input.baseRef,
        headRef: input.headRef,
        authorLogin: input.authorLogin,
        changedPaths: input.changedPaths,
        configAuthorEmails: input.authorFamiliarityOptions?.authorEmails,
      },
      gitDependencies,
    );

    baseRevision = familiarityPrContext.baseRevision;
    authorEmails = familiarityPrContext.authorEmails;

    const historySource = createGitHistorySource(input.repositoryRoot);
    const blameSource = createGitBlameSource(input.repositoryRoot);

    familiarityFindings = analyzeFamiliarity({
      authorEmails: familiarityPrContext.authorEmails,
      changedFiles: familiarityPrContext.changedFileEntries,
      historySource,
      blameSource,
      baseRevision: familiarityPrContext.baseRevision,
      historyWindowDays: input.authorFamiliarityOptions?.historyWindowDays,
      classifiedAt: input.classifiedAt,
    });
  }

  if (input.hydrateBlastRadius) {
    const enabledExtractorIds =
      input.blastRadiusOptions?.enabledExtractors ?? [...DEFAULT_V1_EXTRACTOR_IDS];

    const blastRadiusResult = hydrateBlastRadiusContextualEvidence({
      repoRoot: input.repositoryRoot,
      changedFiles: input.changedPaths,
      enabledExtractorIds,
      registry: input.extractorRegistry ?? defaultExtractorRegistry,
      thresholds: input.blastRadiusOptions?.thresholds,
      dependencies: input.dependencies,
    });

    blastRadiusFindings = blastRadiusResult.blastRadiusFindings;
    notAnalyzedForBlastRadius = blastRadiusResult.notAnalyzedForBlastRadius;
    limitations = blastRadiusResult.limitations;
    enabledExtractors = blastRadiusResult.enabledExtractors;
  }

  return {
    contextualEvidence: {
      familiarityFindings,
      blastRadiusFindings,
      notAnalyzedForBlastRadius,
      limitations,
      enabledExtractors,
    },
    ...(baseRevision === undefined ? {} : { baseRevision }),
    ...(authorEmails === undefined ? {} : { authorEmails }),
  };
};
