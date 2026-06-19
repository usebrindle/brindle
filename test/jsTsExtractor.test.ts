/**
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import { describe, expect, it } from "vitest";

import { jsTsExtractor } from "../core/contextual/extractors/jsTsExtractor.js";
import {
  extractStaticJsTsReferences,
  scriptKindForJsTsFile,
} from "../core/contextual/extractors/jsTsImportScan.js";
import {
  readJsTsResolutionConfig,
  resolveJsTsSpecifier,
} from "../core/contextual/extractors/jsTsPathResolution.js";
import type { ExtractorContext } from "../core/contextual/extractors/types.js";

const testContext = (
  resolutionConfig: ExtractorContext["resolutionConfig"] = {},
): ExtractorContext => ({
  repoRoot: "/repo",
  resolutionConfig,
});

describe("jsTsExtractor", () => {
  it("extracts a relative ESM import edge", () => {
    const edges = jsTsExtractor.extractEdges(
      "src/App.tsx",
      `import { helper } from './utils.ts';\n`,
      testContext(),
    );

    expect(edges).toEqual([
      {
        from: "src/App.tsx",
        to: "src/utils.ts",
        kind: "static_import",
      },
    ]);
  });

  it("resolves tsconfig path aliases via baseUrl and paths", () => {
    const context = testContext({
      baseUrl: ".",
      tsconfigPaths: {
        "@/*": ["src/*"],
      },
    });

    const edges = jsTsExtractor.extractEdges(
      "src/App.tsx",
      `import { helper } from '@/utils.ts';\n`,
      context,
    );

    expect(edges).toEqual([
      {
        from: "src/App.tsx",
        to: "src/utils.ts",
        kind: "static_import",
      },
    ]);

    expect(
      jsTsExtractor.resolveSpecifier("src/App.tsx", "@/utils.ts", context),
    ).toBe("src/utils.ts");
  });

  it("extracts both import and static require in the same file", () => {
    const edges = jsTsExtractor.extractEdges(
      "src/legacy.js",
      [
        "import { modern } from './modern.ts';",
        "const legacy = require('./legacy-helper.js');",
      ].join("\n"),
      testContext(),
    );

    expect(edges).toEqual([
      {
        from: "src/legacy.js",
        to: "src/modern.ts",
        kind: "static_import",
      },
      {
        from: "src/legacy.js",
        to: "src/legacy-helper.js",
        kind: "static_require",
      },
    ]);
  });

  it("ignores dynamic require with a non-literal argument", () => {
    const edges = jsTsExtractor.extractEdges(
      "src/dynamic.js",
      [
        "const moduleName = './maybe.js';",
        "const loaded = require(moduleName);",
        "const safe = require('./safe.js');",
      ].join("\n"),
      testContext(),
    );

    expect(edges).toEqual([
      {
        from: "src/dynamic.js",
        to: "src/safe.js",
        kind: "static_require",
      },
    ]);
  });

  it("extracts export-from and import equals declarations", () => {
    const edges = jsTsExtractor.extractEdges(
      "src/barrel.ts",
      [
        "export { foo } from './foo.ts';",
        "import path = require('./path.ts');",
      ].join("\n"),
      testContext(),
    );

    expect(edges).toEqual([
      {
        from: "src/barrel.ts",
        to: "src/foo.ts",
        kind: "static_import",
      },
      {
        from: "src/barrel.ts",
        to: "src/path.ts",
        kind: "static_import",
      },
    ]);
  });

  it("returns undefined edges for bare package imports", () => {
    const edges = jsTsExtractor.extractEdges(
      "src/App.tsx",
      `import React from 'react';\n`,
      testContext(),
    );

    expect(edges).toEqual([]);
    expect(jsTsExtractor.resolveSpecifier("src/App.tsx", "react", testContext())).toBeNull();
  });

  it("claims all v1 JS/TS extensions", () => {
    expect(jsTsExtractor.fileExtensions).toEqual([
      ".js",
      ".jsx",
      ".mjs",
      ".cjs",
      ".ts",
      ".tsx",
      ".mts",
      ".cts",
    ]);
  });
});

describe("jsTsImportScan", () => {
  it("maps file extensions to script kind", () => {
    expect(scriptKindForJsTsFile("src/App.jsx")).toBe("jsx");
    expect(scriptKindForJsTsFile("src/App.tsx")).toBe("tsx");
    expect(scriptKindForJsTsFile("src/App.mjs")).toBe("js");
    expect(scriptKindForJsTsFile("src/App.ts")).toBe("ts");
  });

  it("collects static references without duplicates from nested blocks", () => {
    const references = extractStaticJsTsReferences(
      "src/nested.ts",
      `if (true) { require('./inner.js'); }\nimport './top.ts';\n`,
    );

    expect(references).toEqual([
      { specifier: "./inner.js", kind: "static_require" },
      { specifier: "./top.ts", kind: "static_import" },
    ]);
  });
});

describe("jsTsPathResolution", () => {
  it("reads resolution config keys from extractor context", () => {
    const config = readJsTsResolutionConfig(
      testContext({
        baseUrl: "src",
        tsconfigPaths: { "@/*": ["lib/*"] },
        unrelated: true,
      }),
    );

    expect(config).toEqual({
      baseUrl: "src",
      tsconfigPaths: { "@/*": ["lib/*"] },
    });
  });

  it("resolves extensionless relative imports to .ts", () => {
    expect(
      resolveJsTsSpecifier("src/App.tsx", "./utils", {}),
    ).toBe("src/utils.ts");
  });

  it("resolves stylesheet imports referenced from JS/TS", () => {
    expect(
      resolveJsTsSpecifier("src/App.tsx", "./App.module.css", {}),
    ).toBe("src/App.module.css");
  });
});
