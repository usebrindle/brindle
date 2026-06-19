/**
 * Static import and require scanning for js_ts files via @babel/parser.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import { parse, type ParserPlugin } from "@babel/parser";

const normalizeExtension = (filePath: string): string => {
  const dotIndex = filePath.lastIndexOf(".");
  return dotIndex === -1 ? "" : filePath.slice(dotIndex).toLowerCase();
};

/** Script flavor for JS/TS files (drives Babel parser plugins). */
export type JsTsScriptKind = "js" | "jsx" | "ts" | "tsx";

/** Map file extension to script kind for parsing. */
export const scriptKindForJsTsFile = (filePath: string): JsTsScriptKind => {
  switch (normalizeExtension(filePath)) {
    case ".jsx":
      return "jsx";
    case ".tsx":
      return "tsx";
    case ".ts":
    case ".mts":
    case ".cts":
      return "ts";
    case ".js":
    case ".mjs":
    case ".cjs":
    default:
      return "js";
  }
};

const babelPluginsForJsTsFile = (filePath: string): ParserPlugin[] => {
  switch (scriptKindForJsTsFile(filePath)) {
    case "jsx":
      return ["jsx"];
    case "tsx":
      return ["typescript", "jsx"];
    case "ts":
      return ["typescript"];
    default:
      return [];
  }
};

export type JsTsStaticReferenceKind = "static_import" | "static_require";

export interface JsTsStaticReference {
  specifier: string;
  kind: JsTsStaticReferenceKind;
}

type BabelAstNode = {
  type: string;
  [key: string]: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asAstNode = (value: unknown): BabelAstNode | null =>
  isRecord(value) && typeof value.type === "string" ? (value as BabelAstNode) : null;

const readStringLiteralValue = (node: unknown): string | null => {
  const astNode = asAstNode(node);
  if (astNode?.type !== "StringLiteral") {
    return null;
  }

  const literalValue = astNode.value;
  return typeof literalValue === "string" ? literalValue : null;
};

const isRequireCallee = (callee: unknown): boolean => {
  const calleeNode = asAstNode(callee);
  if (!calleeNode) {
    return false;
  }

  if (calleeNode.type === "Identifier" && calleeNode.name === "require") {
    return true;
  }

  if (calleeNode.type === "MemberExpression") {
    const objectNode = asAstNode(calleeNode.object);
    const propertyNode = asAstNode(calleeNode.property);
    return (
      objectNode?.type === "Identifier" &&
      objectNode.name === "require" &&
      propertyNode?.type === "Identifier" &&
      propertyNode.name === "call"
    );
  }

  return false;
};

const collectImportReferenceFromNode = (
  astNode: BabelAstNode,
  references: JsTsStaticReference[],
): void => {
  if (
    astNode.type !== "ImportDeclaration" &&
    astNode.type !== "ExportAllDeclaration" &&
    astNode.type !== "ExportNamedDeclaration"
  ) {
    return;
  }

  const specifier = readStringLiteralValue(astNode.source);
  if (specifier) {
    references.push({ specifier, kind: "static_import" });
  }
};

const collectRequireReferenceFromNode = (
  astNode: BabelAstNode,
  references: JsTsStaticReference[],
): void => {
  if (astNode.type !== "CallExpression" || !isRequireCallee(astNode.callee)) {
    return;
  }

  const callArguments = astNode.arguments;
  if (!Array.isArray(callArguments) || callArguments.length === 0) {
    return;
  }

  const specifier = readStringLiteralValue(callArguments[0]);
  if (specifier) {
    references.push({ specifier, kind: "static_require" });
  }
};

const collectTsImportEqualsReferenceFromNode = (
  astNode: BabelAstNode,
  references: JsTsStaticReference[],
): void => {
  if (astNode.type !== "TSImportEqualsDeclaration") {
    return;
  }

  const moduleReference = asAstNode(astNode.moduleReference);
  if (moduleReference?.type !== "TSExternalModuleReference") {
    return;
  }

  const specifier = readStringLiteralValue(moduleReference.expression);
  if (specifier) {
    references.push({ specifier, kind: "static_import" });
  }
};

const walkAstNodeChildren = (
  astNode: BabelAstNode,
  references: JsTsStaticReference[],
): void => {
  for (const childValue of Object.values(astNode)) {
    if (Array.isArray(childValue)) {
      for (const childNode of childValue) {
        collectStaticReferencesFromNode(childNode, references);
      }
      continue;
    }

    collectStaticReferencesFromNode(childValue, references);
  }
};

const collectStaticReferencesFromNode = (
  node: unknown,
  references: JsTsStaticReference[],
): void => {
  const astNode = asAstNode(node);
  if (!astNode) {
    return;
  }

  collectImportReferenceFromNode(astNode, references);
  collectRequireReferenceFromNode(astNode, references);
  collectTsImportEqualsReferenceFromNode(astNode, references);
  walkAstNodeChildren(astNode, references);
};

/**
 * Extract static module references from JS/TS source text.
 * Excludes dynamic require/import forms (non-literal arguments).
 */
export const extractStaticJsTsReferences = (
  filePath: string,
  fileText: string,
): readonly JsTsStaticReference[] => {
  const sourceFile = parse(fileText, {
    sourceFilename: filePath,
    sourceType: "module",
    allowImportExportEverywhere: true,
    plugins: babelPluginsForJsTsFile(filePath),
  });

  const references: JsTsStaticReference[] = [];
  collectStaticReferencesFromNode(sourceFile, references);
  return references;
};
