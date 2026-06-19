/**
 * Linear-time string scanning helpers for import extractors.
 *
 * Avoids regex patterns that SonarQube flags for ReDoS (nested/lazy quantifiers).
 */

/** Case-insensitive index of ` as ` word delimiter, or -1 when absent. */
export const indexOfAsKeyword = (text: string): number => {
  const lowerText = text.toLowerCase();
  return lowerText.indexOf(" as ");
};

/** Text before the first ` as ` keyword, trimmed. */
export const textBeforeAsKeyword = (text: string): string => {
  const asIndex = indexOfAsKeyword(text);
  if (asIndex === -1) {
    return text.trim();
  }
  return text.slice(0, asIndex).trim();
};

export interface BalancedParenthesisSpan {
  content: string;
  openIndex: number;
  closeIndex: number;
}

/** Reads parenthesis-delimited content; returns null when unbalanced. */
export const readBalancedParenthesisContent = (
  source: string,
  openParenIndex: number,
): BalancedParenthesisSpan | null => {
  if (source[openParenIndex] !== "(") {
    return null;
  }

  let depth = 1;
  let scanIndex = openParenIndex + 1;
  while (scanIndex < source.length && depth > 0) {
    const character = source[scanIndex];
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
    }
    scanIndex += 1;
  }

  if (depth !== 0) {
    return null;
  }

  const closeIndex = scanIndex - 1;
  return {
    content: source.slice(openParenIndex + 1, closeIndex),
    openIndex: openParenIndex,
    closeIndex,
  };
};

/** Leading run of `.` characters; returns count and remainder after dots. */
export const splitLeadingRelativeDots = (
  specifier: string,
): { dotCount: number; remainder: string } | null => {
  let dotCount = 0;
  while (dotCount < specifier.length && specifier[dotCount] === ".") {
    dotCount += 1;
  }
  if (dotCount === 0) {
    return null;
  }
  return { dotCount, remainder: specifier.slice(dotCount) };
};
