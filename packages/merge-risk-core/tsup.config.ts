import { defineConfig } from "tsup";

/**
 * Bundles `src/index.ts` (core barrel + {@link PlatformAdapter} type-only seam) for npm consumers.
 * Peer deps stay external so hosts dedupe with their own installs.
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "dist",
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  external: ["ajv", "js-yaml", "micromatch"],
});
