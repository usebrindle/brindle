/**
 * Pure Go import string-literal extraction from source text.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */

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

  const importBlockPattern = /\bimport\s*\(\s*([\s\S]*?)\s*\)/g;
  let importBlockMatch: RegExpExecArray | null = importBlockPattern.exec(sourceWithoutComments);
  while (importBlockMatch !== null) {
    for (const specifier of extractGoStringLiterals(importBlockMatch[1])) {
      specifiers.add(specifier);
    }
    importBlockMatch = importBlockPattern.exec(sourceWithoutComments);
  }

  const sourceWithoutImportBlocks = sourceWithoutComments.replace(importBlockPattern, " ");
  const singleImportPattern = /\bimport\s+(?:[\w.]+\s+)?("(?:\\.|[^"\\])*")/g;
  let singleImportMatch: RegExpExecArray | null =
    singleImportPattern.exec(sourceWithoutImportBlocks);
  while (singleImportMatch !== null) {
    specifiers.add(unquoteGoStringLiteral(singleImportMatch[1]));
    singleImportMatch = singleImportPattern.exec(sourceWithoutImportBlocks);
  }

  return [...specifiers];
};
