import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      /** Executable core sources; `adapters/` is type-only until implementations land. */
      include: ["core/**/*.ts"],
      exclude: [
        "**/node_modules/**",
        "core/types.ts",
        "**/*.config.ts",
      ],
    },
  },
});
