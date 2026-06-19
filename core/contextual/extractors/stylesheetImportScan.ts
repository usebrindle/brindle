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

import type { StylesheetReference } from "./stylesheetExtractor.types.js";

const STYLESHEET_AT_RULE_NAMES = new Set(["import", "use", "forward"]);

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

const stripAsAliasSuffix = (params: string): string =>
  params.replace(/\s+as\s+[\w-]+(?:\s+with\s+.+)?$/i, "").trim();

const parseQuotedSpecifier = (params: string): string | null => {
  const trimmedParams = stripAsAliasSuffix(params.trim()).replace(/;$/, "");
  const singleQuoted = trimmedParams.match(/^['"]([^'"]+)['"]/);
  if (singleQuoted?.[1]) {
    return singleQuoted[1];
  }

  const urlMatch = trimmedParams.match(/^url\(\s*['"]?([^'")\s]+)['"]?\s*\)/i);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  const unquoted = trimmedParams.match(/^([\w./_-]+)/);
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

const INDENTED_SASS_AT_RULE_LINE =
  /^\s*@(import|use|forward)\s+(.+?)\s*;?\s*$/;

const collectIndentedSassLineReferences = (
  fileText: string,
): readonly StylesheetReference[] => {
  const references: StylesheetReference[] = [];

  for (const line of fileText.split("\n")) {
    const match = line.match(INDENTED_SASS_AT_RULE_LINE);
    if (!match?.[1] || !match[2]) {
      continue;
    }

    const reference = referenceFromAtRule(match[1], match[2]);
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
  const normalizedPath = filePath.replace(/\\/g, "/");
  const postcssReferences = collectPostcssReferences(normalizedPath, fileText);

  if (!normalizedPath.toLowerCase().endsWith(".sass")) {
    return dedupeReferences(postcssReferences);
  }

  const lineReferences = collectIndentedSassLineReferences(fileText);
  return dedupeReferences([...postcssReferences, ...lineReferences]);
};
