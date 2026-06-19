/**
 * Pure Rust `mod` and `use` path extraction from source text.
 *
 * Inline `mod { … }` blocks and macro-generated modules are excluded.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */

const RUST_STDLIB_CRATE_NAMES = new Set([
  "alloc",
  "core",
  "proc_macro",
  "std",
  "test",
]);

const MOD_DECLARATION_PATTERN = /^\s*mod\s+(\w+)\s*;/;
const GROUPED_USE_PATTERN = /^(.*)::\{([^}]+)\}$/;
const USE_STATEMENT_PATTERN = /^use\s+(.+?)\s*;$/;

const stripRustCommentsAndStrings = (source: string): string => {
  const withoutRawStrings = source.replace(/r#+"[\s\S]*?"#+/g, " ");
  const withoutDoubleQuoted = withoutRawStrings.replace(/"(?:\\.|[^"\\])*"/g, " ");
  const withoutLineComments = withoutDoubleQuoted.replace(/\/\/[^\n]*/g, " ");
  return withoutLineComments.replace(/\/\*[\s\S]*?\*\//g, " ");
};

const isMacroGeneratedModuleLine = (line: string): boolean =>
  /\b(?:include!|include_str!|include_bytes!|concat!|env!)\s*\(/.test(line);

const parseModDeclarationName = (line: string): string | null => {
  const modMatch = MOD_DECLARATION_PATTERN.exec(line);
  return modMatch?.[1] ?? null;
};

const splitUsePathSegments = (usePath: string): readonly string[] =>
  usePath
    .split("::")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== "{}" && segment !== "}");

const expandGroupedUsePaths = (useClause: string): readonly string[] => {
  const normalizedClause = useClause.replace(/\s+/g, " ").trim();
  if (!normalizedClause) {
    return [];
  }

  const braceMatch = GROUPED_USE_PATTERN.exec(normalizedClause);
  if (!braceMatch) {
    return [normalizedClause.split(/\s+as\s+/)[0]?.trim() ?? normalizedClause];
  }

  const prefix = braceMatch[1]?.trim();
  const groupedItems = braceMatch[2]
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  const expandedPaths: string[] = [];
  for (const groupedItem of groupedItems) {
    const itemPath = groupedItem.split(/\s+as\s+/)[0]?.trim();
    if (!itemPath || itemPath === "self" || itemPath === "super") {
      if (prefix) {
        expandedPaths.push(`${prefix}::${itemPath}`);
      }
      continue;
    }
    expandedPaths.push(prefix ? `${prefix}::${itemPath}` : itemPath);
  }

  return expandedPaths;
};

const parseUseStatementPaths = (statement: string): readonly string[] => {
  const normalizedStatement = statement.replace(/\s+/g, " ").trim();
  const useMatch = USE_STATEMENT_PATTERN.exec(normalizedStatement);
  if (!useMatch?.[1]) {
    return [];
  }

  const useClause = useMatch[1].replace(/\s+as\s+\w+/g, "").trim();
  return expandGroupedUsePaths(useClause);
};

/**
 * Extract `mod name;` declarations from Rust source.
 *
 * Inline `mod name { … }` blocks are excluded.
 *
 * @param source - Rust source file text.
 * @returns Module names declared via external file modules.
 */
export const extractRustModDeclarations = (source: string): readonly string[] => {
  const sanitizedSource = stripRustCommentsAndStrings(source);
  const moduleNames = new Set<string>();

  for (const sourceLine of sanitizedSource.split("\n")) {
    const trimmedLine = sourceLine.trim();
    if (!trimmedLine.startsWith("mod ") || trimmedLine.includes("{")) {
      continue;
    }
    if (isMacroGeneratedModuleLine(trimmedLine)) {
      continue;
    }

    const moduleName = parseModDeclarationName(trimmedLine);
    if (moduleName) {
      moduleNames.add(moduleName);
    }
  }

  return [...moduleNames];
};

/**
 * Extract unresolved `use` path strings from Rust source.
 *
 * Handles grouped imports and `crate` / `super` / `self` prefixes.
 * Macro-generated paths are excluded when the line contains macro invocations.
 *
 * @param source - Rust source file text.
 * @returns Unresolved use path strings (e.g. `crate::services::auth`).
 */
export const extractRustUsePaths = (source: string): readonly string[] => {
  const sanitizedSource = stripRustCommentsAndStrings(source);
  const usePaths = new Set<string>();

  for (const sourceLine of sanitizedSource.split("\n")) {
    const trimmedLine = sourceLine.trim();
    if (!trimmedLine.startsWith("use ") || !trimmedLine.endsWith(";")) {
      continue;
    }
    if (isMacroGeneratedModuleLine(trimmedLine)) {
      continue;
    }

    for (const usePath of parseUseStatementPaths(trimmedLine)) {
      if (usePath.length > 0) {
        usePaths.add(usePath);
      }
    }
  }

  return [...usePaths];
};

/** Whether a top-level use path refers to the Rust standard library. */
export const isRustStdCratePath = (usePath: string): boolean => {
  const topLevelSegment = splitUsePathSegments(usePath)[0];
  return topLevelSegment !== undefined && RUST_STDLIB_CRATE_NAMES.has(topLevelSegment);
};

export { splitUsePathSegments };
