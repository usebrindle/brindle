/**
 * Static import and require scanning for js_ts files via the TypeScript AST.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import ts from "typescript";

const normalizeExtension = (filePath: string): string => {
  const dotIndex = filePath.lastIndexOf(".");
  return dotIndex === -1 ? "" : filePath.slice(dotIndex).toLowerCase();
};

/** Map file extension to TypeScript ScriptKind for parsing. */
export const scriptKindForJsTsFile = (filePath: string): ts.ScriptKind => {
  switch (normalizeExtension(filePath)) {
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".ts":
    case ".mts":
    case ".cts":
    default:
      return ts.ScriptKind.TS;
  }
};

export type JsTsStaticReferenceKind = "static_import" | "static_require";

export interface JsTsStaticReference {
  specifier: string;
  kind: JsTsStaticReferenceKind;
}

const collectStaticReferencesFromNode = (
  node: ts.Node,
  references: JsTsStaticReference[],
): void => {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    const moduleSpecifier = node.moduleSpecifier;
    if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
      references.push({ specifier: moduleSpecifier.text, kind: "static_import" });
    }
  }

  if (ts.isCallExpression(node)) {
    const { expression, arguments: callArguments } = node;
    const isRequireCall =
      (ts.isIdentifier(expression) && expression.text === "require") ||
      (ts.isPropertyAccessExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        expression.expression.text === "require" &&
        expression.name.text === "call");

    if (isRequireCall && callArguments[0] && ts.isStringLiteral(callArguments[0])) {
      references.push({ specifier: callArguments[0].text, kind: "static_require" });
    }
  }

  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    const moduleReferenceExpression = node.moduleReference.expression;
    if (moduleReferenceExpression && ts.isStringLiteral(moduleReferenceExpression)) {
      references.push({ specifier: moduleReferenceExpression.text, kind: "static_import" });
    }
  }

  ts.forEachChild(node, (child) => collectStaticReferencesFromNode(child, references));
};

/**
 * Extract static module references from JS/TS source text.
 * Excludes dynamic require/import forms (non-literal arguments).
 */
export const extractStaticJsTsReferences = (
  filePath: string,
  fileText: string,
): readonly JsTsStaticReference[] => {
  const sourceFile = ts.createSourceFile(
    filePath,
    fileText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForJsTsFile(filePath),
  );

  const references: JsTsStaticReference[] = [];
  collectStaticReferencesFromNode(sourceFile, references);
  return references;
};
