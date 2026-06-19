/**
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import { describe, expect, it } from "vitest";

import { goExtractor } from "../core/contextual/extractors/goExtractor.js";
import { extractGoImportSpecifiers } from "../core/contextual/extractors/goImportScan.js";
import {
  readGoResolutionConfig,
  resolveGoImportToRepoFile,
  resolveGoSpecifier,
} from "../core/contextual/extractors/goPathResolution.js";
import { buildReverseDependencyGraph } from "../core/contextual/extractors/buildReverseDependencyGraph.js";
import type { ExtractorContext } from "../core/contextual/extractors/types.js";

const EXAMPLE_MODULE = "example.com/myapp";

const testContext = (
  resolutionConfig: ExtractorContext["resolutionConfig"] = {
    modulePath: EXAMPLE_MODULE,
  },
): ExtractorContext => ({
  repoRoot: "/repo",
  resolutionConfig,
});

describe("goExtractor", () => {
  it("extracts a single internal import edge", () => {
    const edges = goExtractor.extractEdges(
      "cmd/main.go",
      `package main\n\nimport "example.com/myapp/internal/shared"\n`,
      testContext(),
    );

    expect(edges).toEqual([
      {
        from: "cmd/main.go",
        to: "internal/shared/shared.go",
        kind: "go_import",
      },
    ]);
  });

  it("extracts grouped imports including aliased and blank imports", () => {
    const edges = goExtractor.extractEdges(
      "internal/handler/handler.go",
      [
        "package handler",
        "",
        "import (",
        '  "fmt"',
        '  shared "example.com/myapp/internal/shared"',
        '  _ "example.com/myapp/internal/telemetry"',
        ")",
      ].join("\n"),
      testContext(),
    );

    expect(edges).toEqual([
      {
        from: "internal/handler/handler.go",
        to: "internal/shared/shared.go",
        kind: "go_import",
      },
      {
        from: "internal/handler/handler.go",
        to: "internal/telemetry/telemetry.go",
        kind: "go_import",
      },
    ]);
  });

  it("builds an internal package import chain in the reverse graph", () => {
    const moduleContext = testContext();
    const mainEdges = goExtractor.extractEdges(
      "cmd/main.go",
      `import "example.com/myapp/internal/handler"\n`,
      moduleContext,
    );
    const handlerEdges = goExtractor.extractEdges(
      "internal/handler/handler.go",
      `import "example.com/myapp/internal/shared"\n`,
      moduleContext,
    );

    const graph = buildReverseDependencyGraph([...mainEdges, ...handlerEdges]);

    expect(graph.get("internal/handler/handler.go")).toEqual(["cmd/main.go"]);
    expect(graph.get("internal/shared/shared.go")).toEqual(["internal/handler/handler.go"]);
  });

  it("excludes stdlib and external module imports", () => {
    const edges = goExtractor.extractEdges(
      "cmd/main.go",
      [
        'import "fmt"',
        'import "github.com/stretchr/testify/assert"',
        'import "example.com/other/module/pkg"',
      ].join("\n"),
      testContext(),
    );

    expect(edges).toEqual([]);
  });

  it("resolves internal specifiers via resolveSpecifier", () => {
    expect(
      goExtractor.resolveSpecifier(
        "cmd/main.go",
        "example.com/myapp/internal/shared",
        testContext(),
      ),
    ).toBe("internal/shared/shared.go");
    expect(
      goExtractor.resolveSpecifier("cmd/main.go", "fmt", testContext()),
    ).toBeNull();
  });

  it("returns no edges when modulePath is missing from resolution config", () => {
    const edges = goExtractor.extractEdges(
      "cmd/main.go",
      `import "example.com/myapp/internal/shared"\n`,
      testContext({}),
    );

    expect(edges).toEqual([]);
  });
});

describe("extractGoImportSpecifiers", () => {
  it("ignores line comments when scanning import blocks", () => {
    expect(
      extractGoImportSpecifiers(
        [
          "import (",
          '  "example.com/myapp/internal/shared" // primary dependency',
          ")",
        ].join("\n"),
      ),
    ).toEqual(["example.com/myapp/internal/shared"]);
  });
});

describe("resolveGoImportToRepoFile", () => {
  it("maps module-relative import paths to canonical package files", () => {
    expect(
      resolveGoImportToRepoFile("example.com/myapp/internal/shared", EXAMPLE_MODULE),
    ).toBe("internal/shared/shared.go");
    expect(resolveGoImportToRepoFile("fmt", EXAMPLE_MODULE)).toBeNull();
  });

  it("reads modulePath from extractor context", () => {
    expect(
      resolveGoSpecifier(
        "cmd/main.go",
        "example.com/myapp/internal/shared",
        testContext(),
      ),
    ).toBe("internal/shared/shared.go");
    expect(readGoResolutionConfig(testContext()).modulePath).toBe(EXAMPLE_MODULE);
  });
});
