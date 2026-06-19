/**
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import { describe, expect, it } from "vitest";

import { rustExtractor } from "../core/contextual/extractors/rustExtractor.js";
import {
  extractRustModDeclarations,
  extractRustUsePaths,
  isRustStdCratePath,
} from "../core/contextual/extractors/rustModUseScan.js";
import {
  readRustResolutionConfig,
  resolveRustModToRepoFile,
  resolveRustUsePathToRepoFile,
  resolveRustSpecifier,
} from "../core/contextual/extractors/rustPathResolution.js";
import { buildReverseDependencyGraph } from "../core/contextual/extractors/buildReverseDependencyGraph.js";
import type { ExtractorContext } from "../core/contextual/extractors/types.js";
import type { RustCrateRoot } from "../core/contextual/extractors/rustExtractor.types.js";

const ROOT_CRATE: RustCrateRoot = {
  memberPath: ".",
  packageName: "myapp",
  sourceRoot: "src",
};

const UTIL_CRATE: RustCrateRoot = {
  memberPath: "crates/util",
  packageName: "util",
  sourceRoot: "crates/util/src",
};

const testContext = (
  crateRoots: readonly RustCrateRoot[] = [ROOT_CRATE],
): ExtractorContext => ({
  repoRoot: "/repo",
  resolutionConfig: { crateRoots },
});

describe("rustExtractor", () => {
  it("extracts mod declaration edges to canonical foo.rs paths", () => {
    const edges = rustExtractor.extractEdges(
      "src/lib.rs",
      "mod handler;\nmod shared;\n",
      testContext(),
    );

    expect(edges).toEqual([
      {
        from: "src/lib.rs",
        to: "src/handler.rs",
        kind: "rust_mod",
      },
      {
        from: "src/lib.rs",
        to: "src/shared.rs",
        kind: "rust_mod",
      },
    ]);
  });

  it("extracts crate use paths and resolves directory modules via mod.rs layout", () => {
    const edges = rustExtractor.extractEdges(
      "src/app/mod.rs",
      [
        "mod services;",
        "use crate::services::worker;",
        "use self::config;",
      ].join("\n"),
      testContext(),
    );

    expect(edges).toEqual([
      {
        from: "src/app/mod.rs",
        to: "src/app/services.rs",
        kind: "rust_mod",
      },
      {
        from: "src/app/mod.rs",
        to: "src/services/worker.rs",
        kind: "rust_use",
      },
      {
        from: "src/app/mod.rs",
        to: "src/app/config.rs",
        kind: "rust_use",
      },
    ]);
  });

  it("resolves super paths from nested module files", () => {
    const edges = rustExtractor.extractEdges(
      "src/app/services.rs",
      "use super::config;\n",
      testContext(),
    );

    expect(edges).toEqual([
      {
        from: "src/app/services.rs",
        to: "src/app/config.rs",
        kind: "rust_use",
      },
    ]);
  });

  it("builds an internal module chain in the reverse graph", () => {
    const context = testContext();
    const libEdges = rustExtractor.extractEdges(
      "src/lib.rs",
      "mod gateway;\n",
      context,
    );
    const gatewayEdges = rustExtractor.extractEdges(
      "src/gateway.rs",
      "use crate::shared::util;\n",
      context,
    );

    const graph = buildReverseDependencyGraph([...libEdges, ...gatewayEdges]);

    expect(graph.get("src/gateway.rs")).toEqual(["src/lib.rs"]);
    expect(graph.get("src/shared/util.rs")).toEqual(["src/gateway.rs"]);
  });

  it("resolves workspace crate use paths across members", () => {
    const edges = rustExtractor.extractEdges(
      "src/main.rs",
      "use util::helpers::format;\n",
      testContext([ROOT_CRATE, UTIL_CRATE]),
    );

    expect(edges).toEqual([
      {
        from: "src/main.rs",
        to: "crates/util/src/helpers/format.rs",
        kind: "rust_use",
      },
    ]);
  });

  it("excludes stdlib, external crates, inline mod blocks, and macro-generated modules", () => {
    const edges = rustExtractor.extractEdges(
      "src/main.rs",
      [
        "use std::collections::HashMap;",
        "use serde::Serialize;",
        "mod inline { pub fn demo() {} }",
        "include!(concat!(env!(\"OUT_DIR\"), \"/generated.rs\"));",
      ].join("\n"),
      testContext(),
    );

    expect(edges).toEqual([]);
  });

  it("resolves specifiers via resolveSpecifier", () => {
    expect(
      rustExtractor.resolveSpecifier("src/lib.rs", "handler", testContext()),
    ).toBe("src/handler.rs");
    expect(
      rustExtractor.resolveSpecifier(
        "src/gateway.rs",
        "crate::shared::util",
        testContext(),
      ),
    ).toBe("src/shared/util.rs");
    expect(
      rustExtractor.resolveSpecifier("src/main.rs", "std::io", testContext()),
    ).toBeNull();
  });

  it("returns no edges when crateRoots is missing from resolution config", () => {
    const edges = rustExtractor.extractEdges(
      "src/lib.rs",
      "mod handler;\n",
      testContext([]),
    );

    expect(edges).toEqual([]);
  });
});

describe("extractRustModDeclarations", () => {
  it("ignores inline mod blocks and comments", () => {
    expect(
      extractRustModDeclarations(
        [
          "mod handler; // gateway module",
          "mod inline { fn demo() {} }",
          "mod generated;",
        ].join("\n"),
      ),
    ).toEqual(["handler", "generated"]);
  });
});

describe("extractRustUsePaths", () => {
  it("extracts grouped and aliased use paths", () => {
    expect(
      extractRustUsePaths(
        [
          "use crate::services::{worker, config as app_config};",
          "use super::shared;",
        ].join("\n"),
      ),
    ).toEqual(["crate::services::worker", "crate::services::config", "super::shared"]);
  });

  it("recognizes stdlib crate paths", () => {
    expect(isRustStdCratePath("std::collections")).toBe(true);
    expect(isRustStdCratePath("myapp::services")).toBe(false);
  });
});

describe("resolveRustModToRepoFile", () => {
  it("maps mod declarations and use paths to canonical module files", () => {
    expect(
      resolveRustModToRepoFile("src/lib.rs", "handler", [ROOT_CRATE]),
    ).toBe("src/handler.rs");
    expect(
      resolveRustUsePathToRepoFile("crate::shared::util", "src/gateway.rs", [ROOT_CRATE]),
    ).toBe("src/shared/util.rs");
    expect(readRustResolutionConfig(testContext()).crateRoots).toEqual([ROOT_CRATE]);
    expect(
      resolveRustSpecifier("src/lib.rs", "handler", testContext()),
    ).toBe("src/handler.rs");
  });
});
