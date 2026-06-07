/**
 * Packs `@usebrindle/merge-risk-core`, installs the .tgz in a temp project with peers, runs score().
 * Run from repo root after `npm run build:merge-risk-core`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
process.chdir(root);

if (!existsSync(join(root, "packages", "merge-risk-core", "dist", "index.js"))) {
  console.error("Run npm run build:merge-risk-core first.");
  process.exit(1);
}

const packDir = mkdtempSync(join(tmpdir(), "merge-risk-core-pack-"));
execFileSync("npm", ["pack", "-w", "@usebrindle/merge-risk-core", "--pack-destination", packDir], {
  stdio: "inherit",
});

const tarball = readdirSync(packDir).find((name) => name.endsWith(".tgz"));
if (tarball === undefined) {
  console.error("npm pack did not produce a .tgz in", packDir);
  process.exit(1);
}
const tarballPath = join(packDir, tarball);
const tarballRef = pathToFileURL(tarballPath).href;

const consumerDir = mkdtempSync(join(tmpdir(), "merge-risk-core-consumer-"));

writeFileSync(
  join(consumerDir, "package.json"),
  JSON.stringify(
    {
      name: "merge-risk-core-tarball-smoke",
      private: true,
      type: "module",
      dependencies: {
        "@usebrindle/merge-risk-core": tarballRef,
        ajv: "^8.17.0",
        "js-yaml": "^4.1.0",
        micromatch: "^4.0.5",
      },
    },
    null,
    2,
  ),
);

const runSnippet = `
import { loadMergeRiskRepositoryYaml, score } from "@usebrindle/merge-risk-core";

const yaml = \`
thresholds:
  low: 30
  medium: 60
criteria:
  diff_size:
    weight: 100
\`;

const { scoringConfig } = loadMergeRiskRepositoryYaml(yaml);
const result = score(
  {
    repoSlug: "acme/demo",
    changeNumber: 1,
    headSha: "abc",
    baseRef: "main",
    author: "alice",
    title: "x",
    body: "",
    labels: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    files: [],
    totalAdditions: 0,
    totalDeletions: 0,
  },
  scoringConfig,
);

if (typeof result.score !== "number" || result.tier === undefined) {
  console.error("unexpected score result", result);
  process.exit(1);
}
console.log("merge-risk-core tarball smoke ok", result.tier, result.score);
`;

writeFileSync(join(consumerDir, "run.mjs"), runSnippet);

try {
  execFileSync("npm", ["install"], { cwd: consumerDir, stdio: "inherit" });
  execFileSync(process.execPath, ["run.mjs"], { cwd: consumerDir, stdio: "inherit" });
} finally {
  rmSync(packDir, { recursive: true, force: true });
  rmSync(consumerDir, { recursive: true, force: true });
}
