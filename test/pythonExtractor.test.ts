/**
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import { describe, expect, it } from "vitest";

import { pythonExtractor } from "../core/contextual/extractors/pythonExtractor.js";
import {
  extractPythonImportSpecifiers,
  isStdlibTopLevelModule,
} from "../core/contextual/extractors/pythonImportScan.js";
import {
  readPythonResolutionConfig,
  resolvePythonModuleToRepoFile,
  resolvePythonSpecifier,
} from "../core/contextual/extractors/pythonPathResolution.js";
import { buildReverseDependencyGraph } from "../core/contextual/extractors/buildReverseDependencyGraph.js";
import type { ExtractorContext } from "../core/contextual/extractors/types.js";

const testContext = (
  resolutionConfig: ExtractorContext["resolutionConfig"] = {},
): ExtractorContext => ({
  repoRoot: "/repo",
  resolutionConfig,
});

describe("pythonExtractor", () => {
  it("extracts an absolute internal import edge", () => {
    const edges = pythonExtractor.extractEdges(
      "main.py",
      "import app.handlers.processor\n",
      testContext(),
    );

    expect(edges).toEqual([
      {
        from: "main.py",
        to: "app/handlers/processor.py",
        kind: "python_import",
      },
    ]);
  });

  it("extracts from-import and relative import edges", () => {
    const edges = pythonExtractor.extractEdges(
      "app/handlers/processor.py",
      [
        "from app.services import util",
        "from ..models import record",
        "from . import helpers",
      ].join("\n"),
      testContext(),
    );

    expect(edges).toEqual([
      {
        from: "app/handlers/processor.py",
        to: "app/services.py",
        kind: "python_import",
      },
      {
        from: "app/handlers/processor.py",
        to: "app/models.py",
        kind: "python_import",
      },
      {
        from: "app/handlers/processor.py",
        to: "app/handlers/helpers.py",
        kind: "python_import",
      },
    ]);
  });

  it("builds an internal package import chain in the reverse graph", () => {
    const context = testContext();
    const mainEdges = pythonExtractor.extractEdges(
      "main.py",
      "import app.handlers.processor\n",
      context,
    );
    const handlerEdges = pythonExtractor.extractEdges(
      "app/handlers/processor.py",
      "import app.services.util\n",
      context,
    );

    const graph = buildReverseDependencyGraph([...mainEdges, ...handlerEdges]);

    expect(graph.get("app/handlers/processor.py")).toEqual(["main.py"]);
    expect(graph.get("app/services/util.py")).toEqual(["app/handlers/processor.py"]);
  });

  it("excludes stdlib and dynamic imports", () => {
    const edges = pythonExtractor.extractEdges(
      "main.py",
      [
        "import json",
        "import os",
        "module = __import__('app.hidden')",
        "importlib.import_module(variable)",
      ].join("\n"),
      testContext(),
    );

    expect(edges).toEqual([]);
  });

  it("resolves specifiers via resolveSpecifier", () => {
    expect(
      pythonExtractor.resolveSpecifier("main.py", "app.services.util", testContext()),
    ).toBe("app/services/util.py");
    expect(
      pythonExtractor.resolveSpecifier(
        "app/handlers/processor.py",
        "..models",
        testContext(),
      ),
    ).toBe("app/models.py");
    expect(pythonExtractor.resolveSpecifier("main.py", "json", testContext())).toBeNull();
  });

  it("resolves absolute imports under configured package roots", () => {
    const edges = pythonExtractor.extractEdges(
      "src/main.py",
      "import mypkg.utils.helper\n",
      testContext({ packageRoots: ["src"] }),
    );

    expect(edges).toEqual([
      {
        from: "src/main.py",
        to: "src/mypkg/utils/helper.py",
        kind: "python_import",
      },
    ]);
  });

  it("supports .pyi stub files", () => {
    expect(pythonExtractor.fileExtensions).toEqual([".py", ".pyi"]);
    expect(
      pythonExtractor.extractEdges(
        "app/types.pyi",
        "import app.models.record\n",
        testContext(),
      ),
    ).toEqual([
      {
        from: "app/types.pyi",
        to: "app/models/record.py",
        kind: "python_import",
      },
    ]);
  });
});

describe("extractPythonImportSpecifiers", () => {
  it("extracts parenthesized and aliased imports", () => {
    expect(
      extractPythonImportSpecifiers(
        [
          "import app.handlers.processor as processor",
          "from app.services.util import (",
          "    load,",
          "    save,",
          ")",
        ].join("\n"),
      ),
    ).toEqual(["app.handlers.processor", "app.services.util"]);
  });

  it("ignores comments when scanning import statements", () => {
    expect(
      extractPythonImportSpecifiers(
        'import app.shared  # primary dependency\n',
      ),
    ).toEqual(["app.shared"]);
  });

  it("recognizes stdlib top-level modules", () => {
    expect(isStdlibTopLevelModule("json")).toBe(true);
    expect(isStdlibTopLevelModule("app.utils")).toBe(false);
  });
});

describe("resolvePythonModuleToRepoFile", () => {
  it("maps absolute and relative module paths to canonical files", () => {
    expect(resolvePythonModuleToRepoFile("app.services.util", "main.py", ["."])).toBe(
      "app/services/util.py",
    );
    expect(
      resolvePythonModuleToRepoFile("..models", "app/handlers/processor.py", ["."],),
    ).toBe("app/models.py");
    expect(readPythonResolutionConfig(testContext()).packageRoots).toEqual(["."]);
    expect(
      resolvePythonSpecifier("main.py", "app.services.util", testContext()),
    ).toBe("app/services/util.py");
  });
});
