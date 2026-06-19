/**
 * Unit tests for pure blast-radius analysis over reverse dependency graphs.
 *
 * @see docs/designs/lld-blast-radius-criterion.md
 */
import { describe, expect, it } from "vitest";

import {
  analyzeBlastRadius,
  characterizeBlastRadius,
  countDirectImportersForFile,
  countTransitiveReachForFile,
} from "../core/contextual/blastRadius.js";
import { buildReverseDependencyGraph } from "../core/contextual/extractors/buildReverseDependencyGraph.js";
import type { DependencyEdge } from "../core/contextual/extractors/types.js";

const edge = (
  from: string,
  to: string,
  kind: DependencyEdge["kind"] = "static_import",
): DependencyEdge => ({ from, to, kind });

describe("countDirectImportersForFile", () => {
  it("returns sorted direct importers for a target", () => {
    const graph = buildReverseDependencyGraph([
      edge("src/z.tsx", "src/utils.ts"),
      edge("src/a.tsx", "src/utils.ts"),
    ]);

    expect(countDirectImportersForFile("src/utils.ts", graph)).toEqual({
      dependentCount: 2,
      dependents: ["src/a.tsx", "src/z.tsx"],
    });
  });

  it("returns zero when the changed file has no importers", () => {
    const graph = buildReverseDependencyGraph([edge("src/App.tsx", "src/utils.ts")]);

    expect(countDirectImportersForFile("src/App.tsx", graph)).toEqual({
      dependentCount: 0,
      dependents: [],
    });
  });
});

describe("countTransitiveReachForFile", () => {
  it("terminates on cycles without double-counting ancestors", () => {
    const graph = buildReverseDependencyGraph([
      edge("src/a.ts", "src/b.ts"),
      edge("src/b.ts", "src/c.ts"),
      edge("src/c.ts", "src/a.ts"),
    ]);

    expect(countTransitiveReachForFile("src/b.ts", graph)).toEqual({
      transitiveReachCount: 2,
    });
  });

  it("counts cross-language transitive reach in a unified graph", () => {
    const graph = buildReverseDependencyGraph([
      edge("src/App.tsx", "src/App.module.css", "static_import"),
      edge("src/App.module.css", "src/styles/tokens.scss", "stylesheet_use"),
      edge("src/styles/tokens.scss", "src/styles/_vars.scss", "stylesheet_forward"),
    ]);

    expect(countTransitiveReachForFile("src/styles/_vars.scss", graph)).toEqual({
      transitiveReachCount: 3,
    });
  });
});

describe("characterizeBlastRadius", () => {
  it("maps default thresholds to isolated, moderate, and broad tiers", () => {
    expect(characterizeBlastRadius(0)).toBe("isolated");
    expect(characterizeBlastRadius(2)).toBe("isolated");
    expect(characterizeBlastRadius(3)).toBe("moderate");
    expect(characterizeBlastRadius(10)).toBe("moderate");
    expect(characterizeBlastRadius(11)).toBe("broad");
  });

  it("honors custom threshold overrides", () => {
    expect(
      characterizeBlastRadius(5, { isolatedMax: 1, moderateMax: 4 }),
    ).toBe("broad");
  });
});

describe("analyzeBlastRadius", () => {
  it("reports direct 1 and transitive N+2 as broad on a deep chain", () => {
    const ancestorCount = 11;
    const edges: DependencyEdge[] = [];

    for (let index = 1; index <= ancestorCount; index += 1) {
      edges.push(edge(`src/level-${index - 1}.ts`, `src/level-${index}.ts`));
    }

    const graph = buildReverseDependencyGraph(edges);
    const changedFile = `src/level-${ancestorCount}.ts`;

    const [finding] = analyzeBlastRadius({
      changedFiles: [changedFile],
      graph,
    });

    expect(finding.directDependentCount).toBe(1);
    expect(finding.directDependents).toEqual([`src/level-${ancestorCount - 1}.ts`]);
    expect(finding.transitiveReachCount).toBe(ancestorCount);
    expect(finding.characterization).toBe("broad");
  });

  it("returns one finding per changed file in input order", () => {
    const graph = buildReverseDependencyGraph([
      edge("src/App.tsx", "src/utils.ts"),
      edge("src/Page.tsx", "src/schema.ts"),
    ]);

    const findings = analyzeBlastRadius({
      changedFiles: ["src/utils.ts", "src/schema.ts"],
      graph,
    });

    expect(findings.map((finding) => finding.changedFile)).toEqual([
      "src/utils.ts",
      "src/schema.ts",
    ]);
    expect(findings[0]?.characterization).toBe("isolated");
    expect(findings[1]?.characterization).toBe("isolated");
  });
});
