/**
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import { describe, expect, it } from "vitest";

import {
  builtInExtractors,
  createExtractorRegistry,
  DEFAULT_V1_EXTRACTOR_IDS,
  defaultExtractorRegistry,
} from "../core/contextual/extractors/index.js";
import { buildReverseDependencyGraph } from "../core/contextual/extractors/buildReverseDependencyGraph.js";
import type { DependencyEdge } from "../core/contextual/extractors/types.js";

const edge = (
  from: string,
  to: string,
  kind: DependencyEdge["kind"] = "static_import",
): DependencyEdge => ({ from, to, kind });

/** Mirrors cycle-safe upward walk used by analyzeBlastRadius (US-012). */
const countTransitiveReach = (
  changedFile: string,
  graph: ReturnType<typeof buildReverseDependencyGraph>,
): number => {
  const visited = new Set<string>();
  const queue = [...(graph.get(changedFile) ?? [])];

  while (queue.length > 0) {
    const importer = queue.shift();
    if (!importer || importer === changedFile || visited.has(importer)) {
      continue;
    }
    visited.add(importer);
    for (const nextImporter of graph.get(importer) ?? []) {
      if (nextImporter !== changedFile && !visited.has(nextImporter)) {
        queue.push(nextImporter);
      }
    }
  }

  return visited.size;
};

describe("ExtractorRegistry", () => {
  it("exports DEFAULT_V1_EXTRACTOR_IDS as js_ts and stylesheet", () => {
    expect(DEFAULT_V1_EXTRACTOR_IDS).toEqual(["js_ts", "stylesheet"]);
  });

  it("looks up built-in extractors by id", () => {
    expect(defaultExtractorRegistry.getById("js_ts")?.id).toBe("js_ts");
    expect(defaultExtractorRegistry.getById("stylesheet")?.id).toBe("stylesheet");
    expect(defaultExtractorRegistry.getById("go")).toBeUndefined();
  });

  it("looks up extractors by file extension", () => {
    expect(defaultExtractorRegistry.getForFile("src/App.tsx")?.id).toBe("js_ts");
    expect(defaultExtractorRegistry.getForFile("src/App.TSX")?.id).toBe("js_ts");
    expect(defaultExtractorRegistry.getForFile("styles/main.scss")?.id).toBe("stylesheet");
    expect(defaultExtractorRegistry.getForFile("styles/main.sass")?.id).toBe("stylesheet");
    expect(defaultExtractorRegistry.getForFile("README.md")).toBeUndefined();
    expect(defaultExtractorRegistry.getForFile("Makefile")).toBeUndefined();
  });

  it("registers custom extractors and exposes them as builtIns", () => {
    const registry = createExtractorRegistry(builtInExtractors);
    expect(registry.builtIns).toHaveLength(2);
    expect(registry.builtIns.map((extractor) => extractor.id)).toEqual([
      "js_ts",
      "stylesheet",
    ]);
  });
});

describe("buildReverseDependencyGraph", () => {
  it("maps a single forward edge to one reverse entry", () => {
    const graph = buildReverseDependencyGraph([edge("src/App.tsx", "src/utils.ts")]);

    expect(graph.get("src/utils.ts")).toEqual(["src/App.tsx"]);
    expect(graph.has("src/App.tsx")).toBe(false);
  });

  it("deduplicates duplicate edges and terminates on cycles without double-count", () => {
    const edges = [
      edge("src/a.ts", "src/b.ts"),
      edge("src/b.ts", "src/c.ts"),
      edge("src/c.ts", "src/a.ts"),
      edge("src/a.ts", "src/b.ts"),
    ];
    const graph = buildReverseDependencyGraph(edges);

    expect(graph.get("src/b.ts")).toEqual(["src/a.ts"]);
    expect(graph.get("src/c.ts")).toEqual(["src/b.ts"]);
    expect(graph.get("src/a.ts")).toEqual(["src/c.ts"]);
    expect(countTransitiveReach("src/b.ts", graph)).toBe(2);
  });

  it("merges cross-language chains into one reverse graph", () => {
    const edges = [
      edge("src/App.tsx", "src/App.module.css", "static_import"),
      edge("src/App.module.css", "src/styles/tokens.scss", "stylesheet_use"),
      edge("src/styles/tokens.scss", "src/styles/_vars.scss", "stylesheet_forward"),
    ];
    const graph = buildReverseDependencyGraph(edges);

    expect(graph.get("src/App.module.css")).toEqual(["src/App.tsx"]);
    expect(graph.get("src/styles/tokens.scss")).toEqual(["src/App.module.css"]);
    expect(graph.get("src/styles/_vars.scss")).toEqual(["src/styles/tokens.scss"]);
    expect(countTransitiveReach("src/styles/_vars.scss", graph)).toBe(3);
  });
});
