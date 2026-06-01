/**
 * Parses Istanbul / NYC `coverage-final.json` (per-file statement maps) into a neutral {@link CoverageReport}.
 *
 * {@link CoverageReport.linesCovered} and {@link CoverageReport.linesTotal} carry **statement** hit counts
 * from Istanbul's `s` map (field names match the neutral type for simplicity). See the `test_coverage` criterion.
 *
 * @see docs/adrs/0005-read-findings-not-run-tools.md
 * @see docs/designs/lld-merge-risk-classifier.md
 */

import type { CoverageReport } from "../types.js";

/** Raised when JSON is not a usable Istanbul coverage-final document. */
export class IstanbulCoverageParseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "IstanbulCoverageParseError";
  }
}

type IstanbulStatementMapEntry = {
  start: { line: number; column?: number };
  end: { line: number; column?: number };
};

type IstanbulFileCoverage = {
  path?: string;
  statementMap?: Record<string, IstanbulStatementMapEntry>;
  s?: Record<string, number>;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * @param jsonText - UTF-8 JSON text of an Istanbul `coverage-final` object (map of absolute path → file coverage).
 * @returns Aggregated statement hit counts as {@link CoverageReport} fields.
 */
export const parseIstanbulCoverageJson = (jsonText: string): CoverageReport => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch (cause: unknown) {
    throw new IstanbulCoverageParseError("Istanbul coverage JSON could not be parsed.", { cause });
  }

  if (!isPlainRecord(parsed)) {
    throw new IstanbulCoverageParseError("Istanbul coverage must be a JSON object at the root.");
  }

  let statementsTotal = 0;
  let statementsCovered = 0;

  for (const fileKey of Object.keys(parsed)) {
    const fileEntry = parsed[fileKey];
    if (!isPlainRecord(fileEntry)) {
      continue;
    }
    const fileCoverage = fileEntry as IstanbulFileCoverage;
    const hitMap = fileCoverage.s;
    if (!isPlainRecord(hitMap)) {
      continue;
    }
    for (const statementId of Object.keys(hitMap)) {
      statementsTotal += 1;
      const hits = hitMap[statementId];
      if (typeof hits === "number" && hits > 0) {
        statementsCovered += 1;
      }
    }
  }

  if (statementsTotal === 0) {
    throw new IstanbulCoverageParseError(
      "Istanbul coverage document contains no statement counters (`s` maps are empty or missing).",
    );
  }

  return {
    linesCovered: statementsCovered,
    linesTotal: statementsTotal,
  };
};
