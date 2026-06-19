/**
 * Sort orders for contextual evidence report sections.
 *
 * @see docs/designs/lld-contextual-evidence-reporting.md
 */
import type {
  BlastRadiusCharacterization,
  BlastRadiusFinding,
  ContextualCharacterization,
  FamiliarityFinding,
} from "../contextual.types.js";

const FAMILIARITY_CHARACTERIZATION_ORDER: Record<ContextualCharacterization, number> = {
  none: 0,
  moderate: 1,
  high: 2,
};

const BLAST_RADIUS_CHARACTERIZATION_ORDER: Record<BlastRadiusCharacterization, number> = {
  broad: 0,
  moderate: 1,
  isolated: 2,
};

/**
 * @param findings - Familiarity findings from hydration.
 * @returns Copy sorted none → moderate → high, then path.
 */
export const sortFamiliarityFindingsForReport = (
  findings: readonly FamiliarityFinding[],
): FamiliarityFinding[] =>
  [...findings].sort((leftFinding, rightFinding) => {
    const tierDifference =
      FAMILIARITY_CHARACTERIZATION_ORDER[leftFinding.characterization] -
      FAMILIARITY_CHARACTERIZATION_ORDER[rightFinding.characterization];
    if (tierDifference !== 0) {
      return tierDifference;
    }
    return leftFinding.touchedFile.localeCompare(rightFinding.touchedFile);
  });

/**
 * @param findings - Blast-radius findings from hydration.
 * @returns Copy sorted broad → moderate → isolated, then reach, direct count, path.
 */
export const sortBlastRadiusFindingsForReport = (
  findings: readonly BlastRadiusFinding[],
): BlastRadiusFinding[] =>
  [...findings].sort((leftFinding, rightFinding) => {
    const tierDifference =
      BLAST_RADIUS_CHARACTERIZATION_ORDER[leftFinding.characterization] -
      BLAST_RADIUS_CHARACTERIZATION_ORDER[rightFinding.characterization];
    if (tierDifference !== 0) {
      return tierDifference;
    }
    if (rightFinding.transitiveReachCount !== leftFinding.transitiveReachCount) {
      return rightFinding.transitiveReachCount - leftFinding.transitiveReachCount;
    }
    if (rightFinding.directDependentCount !== leftFinding.directDependentCount) {
      return rightFinding.directDependentCount - leftFinding.directDependentCount;
    }
    return leftFinding.changedFile.localeCompare(rightFinding.changedFile);
  });
