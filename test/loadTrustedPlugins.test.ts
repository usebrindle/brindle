import { describe, expect, it } from "vitest";

import { loadTrustedPlugins, trustedPluginCriterionId } from "../core/plugins/loadTrustedPlugins.js";
import { validateTrustedPluginsPathsStayUnderDirectory } from "../core/plugins/trustedPluginPaths.js";
import type { PRContext } from "../core/types.js";

const minimalContext = (overrides: Partial<PRContext> = {}): PRContext => ({
  repoSlug: "acme/widget",
  changeNumber: 1,
  headSha: "abc",
  baseRef: "main",
  author: "alice",
  title: "t",
  body: "",
  labels: [],
  createdAt: "2020-01-01T00:00:00Z",
  files: [],
  totalAdditions: 0,
  totalDeletions: 0,
  ...overrides,
});

describe("loadTrustedPlugins", () => {
  it("returns empty maps when trusted_plugins is undefined", () => {
    const outcome = loadTrustedPlugins({
      trustedPlugins: undefined,
      pluginFileContentsByNormalizedPath: new Map(),
    });
    expect(outcome).toEqual({ ok: true, criteria: {}, criterionConfigurations: {} });
  });

  it("returns path validation errors from validateTrustedPluginsPathsStayUnderDirectory", () => {
    const outcome = loadTrustedPlugins({
      trustedPlugins: {
        directory: "plugins",
        paths: ["other/x.yaml"],
      },
      pluginFileContentsByNormalizedPath: new Map(),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).toContain("must resolve strictly inside");
    }
  });

  it("fails when a normalized path has no file body in the map", () => {
    const pathValidation = validateTrustedPluginsPathsStayUnderDirectory({
      directory: ".merge-risk-plugins",
      paths: [".merge-risk-plugins/missing.yaml"],
    });
    expect(pathValidation.ok).toBe(true);
    if (!pathValidation.ok) {
      throw new Error("unexpected");
    }
    const [normalizedPath] = pathValidation.normalizedPluginPaths;
    const outcome = loadTrustedPlugins({
      trustedPlugins: {
        directory: ".merge-risk-plugins",
        paths: [".merge-risk-plugins/missing.yaml"],
      },
      pluginFileContentsByNormalizedPath: new Map(),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).toContain("Missing trusted plugin file body");
      expect(outcome.message).toContain(JSON.stringify(normalizedPath));
    }
  });

  it("fails on invalid YAML", () => {
    const pathValidation = validateTrustedPluginsPathsStayUnderDirectory({
      directory: ".merge-risk-plugins",
      paths: [".merge-risk-plugins/broken.yaml"],
    });
    if (!pathValidation.ok) throw new Error("unexpected");
    const [normalizedPath] = pathValidation.normalizedPluginPaths;
    const outcome = loadTrustedPlugins({
      trustedPlugins: {
        directory: ".merge-risk-plugins",
        paths: [".merge-risk-plugins/broken.yaml"],
      },
      pluginFileContentsByNormalizedPath: new Map([[normalizedPath, "[}"]]),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).toContain("Invalid YAML");
    }
  });

  it("fails when kind is not labels_any", () => {
    const pathValidation = validateTrustedPluginsPathsStayUnderDirectory({
      directory: ".merge-risk-plugins",
      paths: [".merge-risk-plugins/wrong-kind.yaml"],
    });
    if (!pathValidation.ok) throw new Error("unexpected");
    const [normalizedPath] = pathValidation.normalizedPluginPaths;
    const outcome = loadTrustedPlugins({
      trustedPlugins: {
        directory: ".merge-risk-plugins",
        paths: [".merge-risk-plugins/wrong-kind.yaml"],
      },
      pluginFileContentsByNormalizedPath: new Map([
        [normalizedPath, "kind: other\nweight: 1\n"],
      ]),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).toContain("unsupported or missing kind");
    }
  });

  it("fails when weight is not a positive finite number", () => {
    const pathValidation = validateTrustedPluginsPathsStayUnderDirectory({
      directory: ".merge-risk-plugins",
      paths: [".merge-risk-plugins/bad-weight.yaml"],
    });
    if (!pathValidation.ok) throw new Error("unexpected");
    const [normalizedPath] = pathValidation.normalizedPluginPaths;
    const outcome = loadTrustedPlugins({
      trustedPlugins: {
        directory: ".merge-risk-plugins",
        paths: [".merge-risk-plugins/bad-weight.yaml"],
      },
      pluginFileContentsByNormalizedPath: new Map([
        [normalizedPath, "kind: labels_any\nweight: 0\nlabels_any: [a]\nscore: 1\n"],
      ]),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).toContain("finite weight > 0");
    }
  });

  it("loads labels_any plugins, sorts criterion ids, and evaluates frozen file options", () => {
    const pathValidation = validateTrustedPluginsPathsStayUnderDirectory({
      directory: ".merge-risk-plugins",
      paths: [".merge-risk-plugins/b.yaml", ".merge-risk-plugins/a.yaml"],
    });
    if (!pathValidation.ok) throw new Error("unexpected");
    const normalizedPaths = pathValidation.normalizedPluginPaths;
    const bodyA = `kind: labels_any
weight: 3
labels_any: [database]
score: 40
`;
    const bodyB = `kind: labels_any
weight: 7
labels_any: [hotfix]
score: 90
`;
    const fileMap = new Map<string, string>();
    for (const path of normalizedPaths) {
      if (path.endsWith("/a.yaml")) fileMap.set(path, bodyA);
      if (path.endsWith("/b.yaml")) fileMap.set(path, bodyB);
    }

    const outcome = loadTrustedPlugins({
      trustedPlugins: {
        directory: ".merge-risk-plugins",
        paths: [".merge-risk-plugins/b.yaml", ".merge-risk-plugins/a.yaml"],
      },
      pluginFileContentsByNormalizedPath: fileMap,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unexpected");
    expect(Object.keys(outcome.criteria).sort()).toEqual([
      trustedPluginCriterionId(".merge-risk-plugins/a.yaml"),
      trustedPluginCriterionId(".merge-risk-plugins/b.yaml"),
    ]);

    const idA = trustedPluginCriterionId(".merge-risk-plugins/a.yaml");
    expect(outcome.criterionConfigurations[idA]?.weight).toBe(3);
    const criterionA = outcome.criteria[idA]!;
    const evaluated = criterionA.evaluate(minimalContext({ labels: ["database"] }), undefined);
    expect(evaluated.score).toBe(40);
    expect(evaluated.justification).toContain("Matched label");
  });
});
