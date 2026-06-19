/**
 * Pure Go import string-literal extraction from source text.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import {
  readBalancedParenthesisContent,
} from "./safeStringScan.js";

const GO_IMPORT_BLOCK_OPEN_PATTERN = /\bimport\s*\(/g;

const stripGoComments = (source: string): string => {
  const withoutLineComments = source.replace(/\/\/[^\n]*/g, "");
  return withoutLineComments.replace(/\/\*[\s\S]*?\*\//g, "");
};

const unquoteGoStringLiteral = (quotedLiteral: string): string => {
  const innerText = quotedLiteral.slice(1, -1);
  return innerText.replace(/\\(["\\])/g, "$1");
};

const extractGoStringLiterals = (segment: string): readonly string[] => {
  const stringLiteralPattern = /"(\\.|[^"\\])*"/g;
  const literals: string[] = [];
  let match: RegExpExecArray | null = stringLiteralPattern.exec(segment);
  while (match !== null) {
    literals.push(unquoteGoStringLiteral(match[0]));
    match = stringLiteralPattern.exec(segment);
  }
  return literals;
};

const collectGoImportBlockContents = (source: string): readonly string[] => {
  const blockContents: string[] = [];
  let openMatch: RegExpExecArray | null = GO_IMPORT_BLOCK_OPEN_PATTERN.exec(source);
  while (openMatch !== null) {
    const openParenIndex = openMatch.index + openMatch[0].length - 1;
    const balancedSpan = readBalancedParenthesisContent(source, openParenIndex);
    if (balancedSpan) {
      blockContents.push(balancedSpan.content);
    }
    openMatch = GO_IMPORT_BLOCK_OPEN_PATTERN.exec(source);
  }
  return blockContents;
};

const removeGoImportBlocks = (source: string): string => {
  let result = "";
  let lastCopiedIndex = 0;
  GO_IMPORT_BLOCK_OPEN_PATTERN.lastIndex = 0;
  let openMatch: RegExpExecArray | null = GO_IMPORT_BLOCK_OPEN_PATTERN.exec(source);
  while (openMatch !== null) {
    const openParenIndex = openMatch.index + openMatch[0].length - 1;
    const balancedSpan = readBalancedParenthesisContent(source, openParenIndex);
    if (balancedSpan) {
      result += source.slice(lastCopiedIndex, openMatch.index);
      result += " ";
      lastCopiedIndex = balancedSpan.closeIndex + 1;
    }
    openMatch = GO_IMPORT_BLOCK_OPEN_PATTERN.exec(source);
  }
  result += source.slice(lastCopiedIndex);
  return result;
};

/**
 * Extract import path string literals from Go source.
 *
 * Handles single `import "path"` and grouped `import (...)` forms.
 * Aliased, blank, and dot imports are included when the path is a string literal.
 *
 * @param source - Go source file text.
 * @returns Unresolved import path specifiers.
 */
export const extractGoImportSpecifiers = (source: string): readonly string[] => {
  const sourceWithoutComments = stripGoComments(source);
  const specifiers = new Set<string>();

  for (const importBlockContent of collectGoImportBlockContents(sourceWithoutComments)) {
    for (const specifier of extractGoStringLiterals(importBlockContent)) {
      specifiers.add(specifier);
    }
  }

  const sourceWithoutImportBlocks = removeGoImportBlocks(sourceWithoutComments);
  const singleImportPattern = /\bimport\s+(?:[\w.]+\s+)?("(?:\\.|[^"\\])*")/g;
  let singleImportMatch: RegExpExecArray | null =
    singleImportPattern.exec(sourceWithoutImportBlocks);
  while (singleImportMatch !== null) {
    specifiers.add(unquoteGoStringLiteral(singleImportMatch[1]));
    singleImportMatch = singleImportPattern.exec(sourceWithoutImportBlocks);
  }

  return [...specifiers];
};
