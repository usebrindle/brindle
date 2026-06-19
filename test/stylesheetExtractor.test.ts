/**
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import { describe, expect, it } from "vitest";

import { buildReverseDependencyGraph } from "../core/contextual/extractors/buildReverseDependencyGraph.js";
import { jsTsExtractor } from "../core/contextual/extractors/jsTsExtractor.js";
import { stylesheetExtractor } from "../core/contextual/extractors/stylesheetExtractor.js";
import { extractStylesheetReferences } from "../core/contextual/extractors/stylesheetImportScan.js";
import {
  readStylesheetResolutionConfig,
  resolveStylesheetSpecifier,
} from "../core/contextual/extractors/stylesheetPathResolution.js";
import type { ExtractorContext } from "../core/contextual/extractors/types.js";

const testContext = (
  resolutionConfig: ExtractorContext["resolutionConfig"] = {},
): ExtractorContext => ({
  repoRoot: "/repo",
  resolutionConfig,
});

describe("stylesheetExtractor", () => {
  it("extracts a CSS @import chain", () => {
    const edges = stylesheetExtractor.extractEdges(
      "styles/a.css",
      [
        "@import url('b.css');",
        "@import 'c.css';",
      ].join("\n"),
      testContext(),
    );

    expect(edges).toEqual([
      {
        from: "styles/a.css",
        to: "styles/b.css",
        kind: "stylesheet_import",
      },
      {
        from: "styles/a.css",
        to: "styles/c.css",
        kind: "stylesheet_import",
      },
    ]);
  });

  it("extracts SCSS @use and @forward edges", () => {
    const edges = stylesheetExtractor.extractEdges(
      "src/styles/main.scss",
      [
        "@use 'tokens';",
        "@forward '../shared/base';",
      ].join("\n"),
      testContext(),
    );

    expect(edges).toEqual([
      {
        from: "src/styles/main.scss",
        to: "src/styles/_tokens.scss",
        kind: "stylesheet_use",
      },
      {
        from: "src/styles/main.scss",
        to: "src/shared/_base.scss",
        kind: "stylesheet_forward",
      },
    ]);
  });

  it("resolves Sass partial and index conventions", () => {
    expect(
      resolveStylesheetSpecifier("src/styles/main.scss", "tokens", {}),
    ).toBe("src/styles/_tokens.scss");

    expect(
      resolveStylesheetSpecifier("src/styles/main.scss", "./theme", {}),
    ).toBe("src/styles/_theme.scss");

    expect(
      resolveStylesheetSpecifier("src/styles/main.scss", "theme/index", {}),
    ).toBe("src/styles/theme/_index.scss");
  });

  it("parses indented .sass via postcss-sass and line scanner fallback", () => {
    const references = extractStylesheetReferences(
      "src/styles/app.sass",
      [
        "@use tokens",
        "@import url('mixins.sass')",
        "@forward 'shared'",
      ].join("\n"),
    );

    expect(references).toEqual([
      { specifier: "tokens", kind: "stylesheet_use" },
      { specifier: "mixins.sass", kind: "stylesheet_import" },
      { specifier: "shared", kind: "stylesheet_forward" },
    ]);

    const edges = stylesheetExtractor.extractEdges(
      "src/styles/app.sass",
      [
        "@use tokens",
        "@import url('mixins.sass')",
      ].join("\n"),
      testContext(),
    );

    expect(edges).toEqual([
      {
        from: "src/styles/app.sass",
        to: "src/styles/_tokens.scss",
        kind: "stylesheet_use",
      },
      {
        from: "src/styles/app.sass",
        to: "src/styles/mixins.sass",
        kind: "stylesheet_import",
      },
    ]);
  });

  it("produces no edges for built-in sass:* modules", () => {
    const edges = stylesheetExtractor.extractEdges(
      "src/styles/math.scss",
      "@use 'sass:math';\n@use 'sass:color' as color;\n",
      testContext(),
    );

    expect(edges).toEqual([]);
    expect(
      stylesheetExtractor.resolveSpecifier("src/styles/math.scss", "sass:math", testContext()),
    ).toBeNull();
  });

  it("merges JS to CSS module imports with stylesheet edges in one graph", () => {
    const jsEdges = jsTsExtractor.extractEdges(
      "src/App.tsx",
      `import styles from './App.module.css';\n`,
      testContext(),
    );
    const cssEdges = stylesheetExtractor.extractEdges(
      "src/App.module.css",
      `@use './styles/tokens';\n`,
      testContext(),
    );
    const scssEdges = stylesheetExtractor.extractEdges(
      "src/styles/tokens.scss",
      `@forward 'vars';\n`,
      testContext(),
    );

    const graph = buildReverseDependencyGraph([...jsEdges, ...cssEdges, ...scssEdges]);

    expect(graph.get("src/App.module.css")).toEqual(["src/App.tsx"]);
    expect(graph.get("src/styles/_tokens.scss")).toEqual(["src/App.module.css"]);
    expect(graph.get("src/styles/_vars.scss")).toEqual(["src/styles/tokens.scss"]);
  });

  it("claims all v1 stylesheet extensions", () => {
    expect(stylesheetExtractor.fileExtensions).toEqual([".css", ".scss", ".sass"]);
  });
});

describe("stylesheetPathResolution", () => {
  it("reads shared resolution config keys from extractor context", () => {
    const config = readStylesheetResolutionConfig(
      testContext({
        baseUrl: "src",
        tsconfigPaths: { "@styles/*": ["styles/*"] },
      }),
    );

    expect(config).toEqual({
      baseUrl: "src",
      tsconfigPaths: { "@styles/*": ["styles/*"] },
    });
  });

  it("resolves aliased stylesheet imports via tsconfig paths", () => {
    const context = testContext({
      baseUrl: ".",
      tsconfigPaths: {
        "@styles/*": ["src/styles/*"],
      },
    });

    expect(
      stylesheetExtractor.resolveSpecifier(
        "src/App.module.css",
        "@styles/tokens",
        context,
      ),
    ).toBe("src/styles/_tokens.scss");
  });
});
