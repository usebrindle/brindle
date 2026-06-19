/**
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { classifyNotAnalyzedChangedFile } from "../adapters/github/contextual/classifyNotAnalyzedChangedFile.js";
import { hydrateDependencyGraph } from "../adapters/github/contextual/hydrateDependencyGraph.js";
import { hydrateResolutionConfig } from "../adapters/github/contextual/hydrateResolutionConfig.js";
import { defaultExtractorRegistry } from "../core/contextual/extractors/builtins.js";

const runGit = (repositoryRoot: string, gitArguments: readonly string[]): void => {
  execFileSync("git", gitArguments, { cwd: repositoryRoot, stdio: "pipe" });
};

const writeTrackedFile = (
  repositoryRoot: string,
  repositoryRelativePath: string,
  fileText: string,
): void => {
  const absolutePath = join(repositoryRoot, repositoryRelativePath);
  mkdirSync(join(absolutePath, ".."), { recursive: true });
  writeFileSync(absolutePath, fileText, "utf8");
};

const createFixtureRepository = (): string => {
  const repositoryRoot = mkdtempSync(join(tmpdir(), "brindle-graph-hydration-"));

  runGit(repositoryRoot, ["init"]);
  runGit(repositoryRoot, ["config", "user.email", "test@example.com"]);
  runGit(repositoryRoot, ["config", "user.name", "Test User"]);

  writeTrackedFile(
    repositoryRoot,
    "src/App.tsx",
    `import styles from './App.module.css';\nexport const app = styles;\n`,
  );
  writeTrackedFile(
    repositoryRoot,
    "src/App.module.css",
    `@use './styles/tokens';\n.app { color: red; }\n`,
  );
  writeTrackedFile(
    repositoryRoot,
    "src/styles/tokens.scss",
    `@forward 'vars';\n`,
  );
  writeTrackedFile(repositoryRoot, "src/styles/_vars.scss", `$color: blue;\n`);
  writeTrackedFile(repositoryRoot, "README.md", "# fixture\n");

  runGit(repositoryRoot, ["add", "."]);
  runGit(repositoryRoot, ["commit", "-m", "fixture"]);

  return repositoryRoot;
};

describe("hydrateResolutionConfig", () => {
  it("reads baseUrl and paths from root tsconfig.json", () => {
    const repositoryRoot = mkdtempSync(join(tmpdir(), "brindle-resolution-config-"));

    try {
      writeFileSync(
        join(repositoryRoot, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            baseUrl: "src",
            paths: {
              "@lib/*": ["lib/*"],
            },
          },
        }),
        "utf8",
      );

      expect(hydrateResolutionConfig(repositoryRoot)).toEqual({
        baseUrl: "src",
        tsconfigPaths: {
          "@lib/*": ["lib/*"],
        },
      });
    } finally {
      rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });

  it("reads module path from root go.mod", () => {
    const repositoryRoot = mkdtempSync(join(tmpdir(), "brindle-go-resolution-config-"));

    try {
      writeFileSync(
        join(repositoryRoot, "go.mod"),
        ["module example.com/myapp", "", "go 1.22"].join("\n"),
        "utf8",
      );

      expect(hydrateResolutionConfig(repositoryRoot)).toEqual({
        modulePath: "example.com/myapp",
      });
    } finally {
      rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });
});

describe("classifyNotAnalyzedChangedFile", () => {
  it("records unsupported extensions and disabled extractors", () => {
    expect(
      classifyNotAnalyzedChangedFile("README.md", ["js_ts", "stylesheet"], defaultExtractorRegistry),
    ).toEqual({
      path: "README.md",
      reason: "no extractor for extension .md",
    });

    expect(
      classifyNotAnalyzedChangedFile(
        "src/styles/tokens.scss",
        ["js_ts"],
        defaultExtractorRegistry,
      ),
    ).toEqual({
      path: "src/styles/tokens.scss",
      reason: "extractor disabled: stylesheet",
    });

    expect(
      classifyNotAnalyzedChangedFile(
        "src/App.tsx",
        ["js_ts", "stylesheet"],
        defaultExtractorRegistry,
      ),
    ).toBeNull();
  });
});

describe("hydrateDependencyGraph", () => {
  it("builds a JS + SCSS reverse graph from tracked files via git ls-files", () => {
    const repositoryRoot = createFixtureRepository();

    try {
      const result = hydrateDependencyGraph({
        repoRoot: repositoryRoot,
        enabledExtractorIds: ["js_ts", "stylesheet"],
        registry: defaultExtractorRegistry,
        changedFiles: ["src/App.tsx", "README.md"],
      });

      expect(result.enabledExtractors).toEqual(["js_ts", "stylesheet"]);
      expect(result.limitations.length).toBeGreaterThan(0);
      expect(result.notAnalyzedForBlastRadius).toEqual([
        {
          path: "README.md",
          reason: "no extractor for extension .md",
        },
      ]);

      expect(result.graph.get("src/App.module.css")).toEqual(["src/App.tsx"]);
      expect(result.graph.get("src/styles/_tokens.scss")).toEqual(["src/App.module.css"]);
      expect(result.graph.get("src/styles/_vars.scss")).toEqual(["src/styles/tokens.scss"]);
    } finally {
      rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });

  it("records stylesheet changed files when stylesheet extractor is disabled", () => {
    const repositoryRoot = createFixtureRepository();

    try {
      const result = hydrateDependencyGraph({
        repoRoot: repositoryRoot,
        enabledExtractorIds: ["js_ts"],
        registry: defaultExtractorRegistry,
        changedFiles: ["src/styles/tokens.scss"],
      });

      expect(result.enabledExtractors).toEqual(["js_ts"]);
      expect(result.notAnalyzedForBlastRadius).toEqual([
        {
          path: "src/styles/tokens.scss",
          reason: "extractor disabled: stylesheet",
        },
      ]);
      expect(result.graph.get("src/styles/_vars.scss")).toBeUndefined();
    } finally {
      rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });
});
