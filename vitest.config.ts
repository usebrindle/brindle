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
        "adapters/github/githubAdapter.types.ts",
        "core/report.types.ts",
        "**/*.config.ts",
      ],
    },
  },
});
