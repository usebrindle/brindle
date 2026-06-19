/**
 * Pure parser for `git blame -e` output used by familiarity hydration.
 *
 * @see docs/designs/lld-author-familiarity-criterion.md
 */

/** One parsed blame line from `git blame -e` output. */
export interface ParsedGitBlameLine {
  beforeSinceBoundary: boolean;
  authorEmail: string;
  lineContent: string;
}

const BLAME_LINE_PATTERN = /^\^?([0-9a-f]+) \(<([^>]+)> .+?\) (.*)$/;

const normalizeAuthorEmail = (authorEmail: string): string => authorEmail.trim().toLowerCase();

const isBlameableLineContent = (lineContent: string): boolean => lineContent.trim().length > 0;

/**
 * Parses `git blame -e` stdout into structured lines.
 *
 * @param blameOutput - Raw stdout from `git blame -e`.
 * @returns Parsed lines in file order (including blank lines).
 */
export const parseGitBlameOutput = (blameOutput: string): readonly ParsedGitBlameLine[] => {
  if (blameOutput.length === 0) {
    return [];
  }

  const parsedLines: ParsedGitBlameLine[] = [];
  for (const blameLine of blameOutput.split("\n")) {
    if (blameLine.length === 0) {
      continue;
    }

    const match = BLAME_LINE_PATTERN.exec(blameLine);
    if (!match) {
      continue;
    }

    parsedLines.push({
      beforeSinceBoundary: blameLine.startsWith("^"),
      authorEmail: normalizeAuthorEmail(match[2] ?? ""),
      lineContent: match[3] ?? "",
    });
  }

  return parsedLines;
};

/**
 * Aggregates ownership and windowed churn from parsed blame lines.
 *
 * @param parsedLines - Output of {@link parseGitBlameOutput}.
 * @param authorEmail - Author email to match (case-insensitive).
 * @param includeWindowedChurn - When true, count lines changed within the `--since` window.
 */
export const aggregateGitBlameStats = (
  parsedLines: readonly ParsedGitBlameLine[],
  authorEmail: string,
  includeWindowedChurn: boolean,
): {
  authorOwnedLineCount: number;
  totalBlameableLineCount: number;
  authorChangedLineCount: number;
  totalChangedLineCount: number;
} => {
  const normalizedAuthorEmail = normalizeAuthorEmail(authorEmail);
  let authorOwnedLineCount = 0;
  let totalBlameableLineCount = 0;
  let authorChangedLineCount = 0;
  let totalChangedLineCount = 0;

  for (const parsedLine of parsedLines) {
    if (!isBlameableLineContent(parsedLine.lineContent)) {
      continue;
    }

    totalBlameableLineCount += 1;
    if (parsedLine.authorEmail === normalizedAuthorEmail) {
      authorOwnedLineCount += 1;
    }

    if (includeWindowedChurn && !parsedLine.beforeSinceBoundary) {
      totalChangedLineCount += 1;
      if (parsedLine.authorEmail === normalizedAuthorEmail) {
        authorChangedLineCount += 1;
      }
    }
  }

  return {
    authorOwnedLineCount,
    totalBlameableLineCount,
    authorChangedLineCount,
    totalChangedLineCount,
  };
};
