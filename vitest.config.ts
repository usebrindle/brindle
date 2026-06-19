import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      /** Executable `core/` and `adapters/` sources; type-only modules excluded below. */
      include: ["core/**/*.ts", "adapters/**/*.ts"],
      exclude: [
        "**/node_modules/**",
        "core/types.ts",
        "core/scorer.types.ts",
        "core/criteria/diffSize.types.ts",
        "core/criteria/testCoverage.types.ts",
        "adapters/PlatformAdapter.ts",
        "adapters/github/githubAdapter.types.ts",
        "core/report.types.ts",
        "core/contextual/contextual.types.ts",
        "core/contextual/extractors/types.ts",
        "core/contextual/extractors/jsTsExtractor.types.ts",
        "**/*.config.ts",
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        branches: 80,
        functions: 80,
      },
    },
  },
});
