/**
 * Static @import / @use / @forward scanning for CSS, SCSS, and indented Sass.
 *
 * Uses postcss-scss for `.css`/`.scss` and postcss-sass plus a line scanner for `.sass`.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import type { Root } from "postcss";
import postcssSass from "postcss-sass";
import postcssScss from "postcss-scss";

import { normalizeForwardSlashes } from "../pathNormalize.js";
import type { StylesheetReference } from "./stylesheetExtractor.types.js";
import { indexOfAsKeyword } from "./safeStringScan.js";

const STYLESHEET_AT_RULE_NAMES = new Set(["import", "use", "forward"]);
const QUOTED_SPECIFIER_PATTERN = /^['"]([^'"]+)['"]/;
const URL_SPECIFIER_PATTERN = /^url\(\s*['"]?([^'")\s]+)['"]?\s*\)/i;
const UNQUOTED_SPECIFIER_PATTERN = /^([\w./-]+)/;

const parseStylesheetRoot = (filePath: string, fileText: string): Root | null => {
  const lowerPath = filePath.toLowerCase();
  try {
    if (lowerPath.endsWith(".sass")) {
      return postcssSass.parse(fileText);
    }
    return postcssScss.parse(fileText);
  } catch {
    return null;
  }
};

const edgeKindForAtRule = (
  atRuleName: string,
): StylesheetReference["kind"] | null => {
  switch (atRuleName) {
    case "import":
      return "stylesheet_import";
    case "use":
      return "stylesheet_use";
    case "forward":
      return "stylesheet_forward";
    default:
      return null;
  }
};

const ALIAS_NAME_PATTERN = /^[\w-]+/;
const WITH_CLAUSE_PREFIX_PATTERN = /^\s+with\b/i;

const stripAsAliasSuffix = (params: string): string => {
  const trimmedParams = params.trim();
  const asAliasIndex = indexOfAsKeyword(trimmedParams);
  if (asAliasIndex === -1) {
    return trimmedParams;
  }

  const suffixAfterAs = trimmedParams
    .slice(asAliasIndex + 4)
    .replace(/;$/, "")
    .trim();
  const aliasNameMatch = ALIAS_NAME_PATTERN.exec(suffixAfterAs);
  if (!aliasNameMatch) {
    return trimmedParams;
  }

  const remainderAfterAlias = suffixAfterAs.slice(aliasNameMatch[0].length);
  const hasValidAliasSuffix =
    remainderAfterAlias.length === 0 || WITH_CLAUSE_PREFIX_PATTERN.test(remainderAfterAlias);
  if (!hasValidAliasSuffix) {
    return trimmedParams;
  }

  return trimmedParams.slice(0, asAliasIndex).trim();
};

const parseQuotedSpecifier = (params: string): string | null => {
  const trimmedParams = stripAsAliasSuffix(params.trim()).replace(/;$/, "");
  const singleQuoted = QUOTED_SPECIFIER_PATTERN.exec(trimmedParams);
  if (singleQuoted?.[1]) {
    return singleQuoted[1];
  }

  const urlMatch = URL_SPECIFIER_PATTERN.exec(trimmedParams);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  const unquoted = UNQUOTED_SPECIFIER_PATTERN.exec(trimmedParams);
  return unquoted?.[1] ?? null;
};

const referenceKey = (reference: StylesheetReference): string =>
  `${reference.kind}:${reference.specifier}`;

const dedupeReferences = (
  references: readonly StylesheetReference[],
): readonly StylesheetReference[] => {
  const seen = new Set<string>();
  const deduped: StylesheetReference[] = [];

  for (const reference of references) {
    const key = referenceKey(reference);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(reference);
  }

  return deduped;
};

const paramsLookMalformed = (params: string): boolean =>
  params.includes("\n") || params.includes("@");

const referenceFromAtRule = (
  atRuleName: string,
  params: string,
): StylesheetReference | null => {
  const kind = edgeKindForAtRule(atRuleName);
  if (!kind || paramsLookMalformed(params)) {
    return null;
  }

  const specifier = parseQuotedSpecifier(params);
  if (!specifier) {
    return null;
  }

  return { specifier, kind };
};

const collectPostcssReferences = (
  filePath: string,
  fileText: string,
): readonly StylesheetReference[] => {
  const references: StylesheetReference[] = [];
  const root = parseStylesheetRoot(filePath, fileText);
  if (!root) {
    return references;
  }

  root.walkAtRules((atRule) => {
    if (!STYLESHEET_AT_RULE_NAMES.has(atRule.name)) {
      return;
    }
    const reference = referenceFromAtRule(atRule.name, atRule.params);
    if (reference) {
      references.push(reference);
    }
  });

  return references;
};

const INDENTED_SASS_AT_RULE_PREFIX = /^\s*@(import|use|forward)\s+/;

const parseIndentedSassAtRuleLine = (
  line: string,
): { atRuleName: string; params: string } | null => {
  const prefixMatch = INDENTED_SASS_AT_RULE_PREFIX.exec(line);
  if (!prefixMatch?.[1]) {
    return null;
  }

  let params = line.slice(prefixMatch[0].length).trimEnd();
  if (params.endsWith(";")) {
    params = params.slice(0, -1).trimEnd();
  }
  if (params.length === 0) {
    return null;
  }

  return { atRuleName: prefixMatch[1], params };
};

const collectIndentedSassLineReferences = (
  fileText: string,
): readonly StylesheetReference[] => {
  const references: StylesheetReference[] = [];

  for (const line of fileText.split("\n")) {
    const parsedLine = parseIndentedSassAtRuleLine(line);
    if (!parsedLine) {
      continue;
    }

    const reference = referenceFromAtRule(parsedLine.atRuleName, parsedLine.params);
    if (reference) {
      references.push(reference);
    }
  }

  return references;
};

/**
 * Extract static stylesheet dependency references from file text.
 * Built-in `sass:*` modules are included here; callers filter them during resolution.
 */
export const extractStylesheetReferences = (
  filePath: string,
  fileText: string,
): readonly StylesheetReference[] => {
  const normalizedPath = normalizeForwardSlashes(filePath);
  const postcssReferences = collectPostcssReferences(normalizedPath, fileText);

  if (!normalizedPath.toLowerCase().endsWith(".sass")) {
    return dedupeReferences(postcssReferences);
  }

  const lineReferences = collectIndentedSassLineReferences(fileText);
  return dedupeReferences([...postcssReferences, ...lineReferences]);
};
