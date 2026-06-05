import { defineConfig } from "tsup";

/**
 * Bundles the repo-root `core/` library for npm consumers (single ESM entry + d.ts).
 * Peer deps stay external so hosts dedupe with their own installs.
 */
export default defineConfig({
  entry: ["../../core/index.ts"],
  format: ["esm"],
  outDir: "dist",
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  external: ["ajv", "js-yaml", "micromatch"],
});
