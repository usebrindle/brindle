/**
 * Create (and optionally push) the annotated git tag for `@usebrindle/merge-risk-core`
 * from packages/merge-risk-core/package.json — matches publish workflow expectations.
 *
 * Usage (repo root):
 *   node scripts/tag-merge-risk-core.mjs
 *   node scripts/tag-merge-risk-core.mjs --dry-run
 *   node scripts/tag-merge-risk-core.mjs --no-push
 *   node scripts/tag-merge-risk-core.mjs --remote upstream
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const pkgPath = resolve(root, "packages", "merge-risk-core", "package.json");

function git(args, opts = {}) {
  execFileSync("git", args, { stdio: "inherit", cwd: root, ...opts });
}

function gitCapture(args) {
  return execFileSync("git", args, { encoding: "utf8", cwd: root }).trimEnd();
}

function parseArgs(argv) {
  let dryRun = false;
  let noPush = false;
  let remote = "origin";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--no-push") noPush = true;
    else if (a === "--remote") {
      const v = argv[++i];
      if (v === undefined) {
        console.error("Missing value for --remote");
        process.exit(1);
      }
      remote = v;
    } else if (a === "-h" || a === "--help") {
      console.log(`Usage: node scripts/tag-merge-risk-core.mjs [options]

Reads version from packages/merge-risk-core/package.json and uses tag
merge-risk-core-v<version> (annotated), matching the publish workflow.

Options:
  --dry-run     Print actions only; do not run git
  --no-push     Create the tag locally but do not push
  --remote NAME Remote name for push (default: origin)
`);
      process.exit(0);
    } else {
      console.error("Unknown argument:", a);
      console.error("Try --help");
      process.exit(1);
    }
  }
  return { dryRun, noPush, remote };
}

function main() {
  const { dryRun, noPush, remote } = parseArgs(process.argv.slice(2));

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch {
    console.error("Could not read or parse:", pkgPath);
    process.exit(1);
  }

  const version = pkg.version;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+/.test(version)) {
    console.error("Expected a semver-like version in package.json, got:", version);
    process.exit(1);
  }

  const tag = `merge-risk-core-v${version}`;
  const message = `Release merge-risk-core v${version}`;

  try {
    gitCapture(["rev-parse", "--is-inside-work-tree"]);
  } catch {
    console.error("Not a git repository (expected to run from repo root).");
    process.exit(1);
  }

  let tagExists = false;
  try {
    gitCapture(["rev-parse", "-q", "--verify", `refs/tags/${tag}`]);
    tagExists = true;
  } catch {
    tagExists = false;
  }

  const tagArgs = ["tag", "-a", tag, "-m", message];
  const pushArgs = ["push", remote, tag];

  if (dryRun) {
    console.log("[dry-run] version from package.json:", version);
    if (tagExists) {
      console.log(`[dry-run] tag ${tag} already exists locally; would skip git tag`);
    } else {
      console.log("[dry-run] would run:", ["git", ...tagArgs].join(" "));
    }
    if (!noPush) console.log("[dry-run] would run:", ["git", ...pushArgs].join(" "));
    return;
  }

  if (tagExists) {
    console.error(`Tag already exists locally: ${tag}`);
    console.error("Delete it first if you need to retag, or bump package.json.");
    process.exit(1);
  }

  console.log(`Tagging ${tag} from packages/merge-risk-core/package.json (${version})`);
  git(tagArgs);
  if (!noPush) {
    console.log(`Pushing ${tag} to ${remote}…`);
    git(pushArgs);
  } else {
    console.log("Skipped push (--no-push). When ready: git push", remote, tag);
  }
}

main();
