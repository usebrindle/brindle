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
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_GIT_REMOTE_NAME = "origin";
const MERGE_RISK_CORE_PACKAGE_DIRECTORY_SEGMENTS = ["packages", "merge-risk-core"];
const PACKAGE_JSON_FILENAME = "package.json";
/** Loose check: major.minor.patch prefix (matches prior script behavior). */
const SEMVER_LIKE_VERSION_PREFIX_PATTERN = /^\d+\.\d+\.\d+/;

/**
 * @typedef {object} CliOptions
 * @property {boolean} isDryRun
 * @property {boolean} shouldSkipPush
 * @property {string} remoteName
 */

const resolveMonorepoRootFromThisModule = () => {
  const thisModuleDirectory = fileURLToPath(new URL(".", import.meta.url));
  return resolve(thisModuleDirectory, "..");
};

const resolveMergeRiskCorePackageJsonPath = (monorepoRoot) =>
  join(monorepoRoot, ...MERGE_RISK_CORE_PACKAGE_DIRECTORY_SEGMENTS, PACKAGE_JSON_FILENAME);

const runGitWithInheritedStdio = (monorepoRoot, gitArguments) => {
  execFileSync("git", gitArguments, { stdio: "inherit", cwd: monorepoRoot });
};

const runGitAndCaptureTrimmedStdout = (monorepoRoot, gitArguments) =>
  execFileSync("git", gitArguments, { encoding: "utf8", cwd: monorepoRoot }).trimEnd();

const formatGitInvocationForOperatorLog = (gitArguments) => ["git", ...gitArguments].join(" ");

const exitProcessWithErrorMessages = (errorMessages) => {
  errorMessages.forEach((errorMessage) => {
    console.error(errorMessage);
  });
  process.exit(1);
};

/**
 * Runs `tryOperation`; on failure, prints `buildErrorMessageLines()` via {@link exitProcessWithErrorMessages} and exits.
 * @template T
 * @param {() => T} tryOperation
 * @param {() => string[]} buildErrorMessageLines
 * @returns {T}
 */
const tryOperationOrExitWithErrorMessages = (tryOperation, buildErrorMessageLines) => {
  try {
    return tryOperation();
  } catch {
    exitProcessWithErrorMessages(buildErrorMessageLines());
  }
};

const printUsageAndExitSuccessfully = () => {
  console.log(`Usage: node scripts/tag-merge-risk-core.mjs [options]

Reads version from packages/merge-risk-core/package.json and uses tag
merge-risk-core-v<version> (annotated), matching the publish workflow.

Options:
  --dry-run     Print actions only; do not run git
  --no-push     Create the tag locally but do not push
  --remote NAME Remote name for push (default: ${DEFAULT_GIT_REMOTE_NAME})
`);
  process.exit(0);
};

const exitProcessDueToUnknownCliArgument = (unknownArgument) =>
  exitProcessWithErrorMessages(["Unknown argument: " + unknownArgument, "Try --help"]);

const exitProcessDueToMissingRemoteValue = () => exitProcessWithErrorMessages(["Missing value for --remote"]);

/**
 * @param {string[]} rawArgv tokens after `node …/tag-merge-risk-core.mjs`
 * @returns {CliOptions}
 */
const parseCliOptions = (rawArgv) => {
  let isDryRun = false;
  let shouldSkipPush = false;
  let remoteName = DEFAULT_GIT_REMOTE_NAME;

  for (let tokenIndex = 0; tokenIndex < rawArgv.length; tokenIndex++) {
    const cliToken = rawArgv[tokenIndex];

    if (cliToken === "--dry-run") {
      isDryRun = true;
      continue;
    }
    if (cliToken === "--no-push") {
      shouldSkipPush = true;
      continue;
    }
    if (cliToken === "--remote") {
      const nextTokenIndex = tokenIndex + 1;
      const remoteValue = rawArgv[nextTokenIndex];
      if (remoteValue === undefined) {
        exitProcessDueToMissingRemoteValue();
      }
      remoteName = remoteValue;
      tokenIndex = nextTokenIndex;
      continue;
    }
    if (cliToken === "-h" || cliToken === "--help") {
      printUsageAndExitSuccessfully();
    }

    exitProcessDueToUnknownCliArgument(cliToken);
  }

  return { isDryRun, shouldSkipPush, remoteName };
};

const readJsonObjectFromFile = (absolutePath) =>
  tryOperationOrExitWithErrorMessages(
    () => JSON.parse(readFileSync(absolutePath, "utf8")),
    () => ["Could not read or parse:", absolutePath],
  );

/**
 * @param {unknown} parsedJson
 * @returns {string} declaredVersion e.g. "0.4.0"
 */
const readDeclaredVersionFromMergeRiskCorePackageJson = (parsedJson) => {
  if (typeof parsedJson !== "object" || parsedJson === null || !("version" in parsedJson)) {
    exitProcessWithErrorMessages([
      "Expected packages/merge-risk-core/package.json to contain a top-level `version` field.",
    ]);
  }
  const declaredVersion = parsedJson.version;
  if (typeof declaredVersion !== "string" || !SEMVER_LIKE_VERSION_PREFIX_PATTERN.test(declaredVersion)) {
    exitProcessWithErrorMessages([
      "Expected a semver-like `version` string in packages/merge-risk-core/package.json, got:",
      String(declaredVersion),
    ]);
  }
  return declaredVersion;
};

const assertCurrentDirectoryIsInsideGitWorkTree = (monorepoRoot) => {
  tryOperationOrExitWithErrorMessages(
    () => runGitAndCaptureTrimmedStdout(monorepoRoot, ["rev-parse", "--is-inside-work-tree"]),
    () => [
      "Not a git repository (expected to run this script from the monorepo root, inside a git work tree).",
    ],
  );
};

const doesLocalGitTagExist = (monorepoRoot, releaseTagName) => {
  const fullyQualifiedTagRef = "refs/tags/" + releaseTagName;
  try {
    runGitAndCaptureTrimmedStdout(monorepoRoot, ["rev-parse", "-q", "--verify", fullyQualifiedTagRef]);
    return true;
  } catch {
    return false;
  }
};

const buildMergeRiskCoreReleaseTagName = (declaredVersion) => "merge-risk-core-v" + declaredVersion;

const buildAnnotatedReleaseTagMessage = (declaredVersion) => "Release merge-risk-core v" + declaredVersion;

const buildGitAnnotatedTagArguments = (releaseTagName, annotatedTagMessage) => [
  "tag",
  "-a",
  releaseTagName,
  "-m",
  annotatedTagMessage,
];

const buildGitPushTagArguments = (remoteName, releaseTagName) => ["push", remoteName, releaseTagName];

const logDryRunGitCommand = (descriptionLabel, gitArguments) => {
  console.log("[dry-run] " + descriptionLabel + ":", formatGitInvocationForOperatorLog(gitArguments));
};

const executeDryRunReport = (
  cliOptions,
  declaredVersion,
  releaseTagName,
  tagAlreadyExistsLocally,
  gitTagArguments,
  gitPushArguments,
) => {
  console.log("[dry-run] version from packages/merge-risk-core/package.json:", declaredVersion);

  if (tagAlreadyExistsLocally) {
    console.log(
      "[dry-run] tag " + releaseTagName + " already exists locally; would skip creating a new annotated tag",
    );
  } else {
    logDryRunGitCommand("would run", gitTagArguments);
  }

  if (!cliOptions.shouldSkipPush) {
    logDryRunGitCommand("would run", gitPushArguments);
  }
};

const exitProcessBecauseReleaseTagAlreadyExists = (releaseTagName) =>
  exitProcessWithErrorMessages([
    "Tag already exists locally: " + releaseTagName,
    "Delete it first if you need to retag, or bump `version` in packages/merge-risk-core/package.json.",
  ]);

const createAnnotatedReleaseTag = (monorepoRoot, gitTagArguments, releaseTagName, declaredVersion) => {
  console.log(
    "Creating annotated tag " + releaseTagName + " from packages/merge-risk-core/package.json (version " + declaredVersion + ")",
  );
  runGitWithInheritedStdio(monorepoRoot, gitTagArguments);
};

const pushReleaseTagOrPrintManualInstructions = (cliOptions, monorepoRoot, gitPushArguments, remoteName, releaseTagName) => {
  if (cliOptions.shouldSkipPush) {
    console.log(
      "Skipped push (--no-push). When ready, run: " + formatGitInvocationForOperatorLog(["push", remoteName, releaseTagName]),
    );
    return;
  }
  console.log("Pushing " + releaseTagName + " to remote `" + remoteName + "`…");
  runGitWithInheritedStdio(monorepoRoot, gitPushArguments);
};

/**
 * @param {CliOptions} cliOptions
 * @param {string} monorepoRoot
 */
const runMergeRiskCoreReleaseTagWorkflow = (cliOptions, monorepoRoot) => {
  const packageJsonAbsolutePath = resolveMergeRiskCorePackageJsonPath(monorepoRoot);
  const mergeRiskCorePackageJson = readJsonObjectFromFile(packageJsonAbsolutePath);
  const declaredVersion = readDeclaredVersionFromMergeRiskCorePackageJson(mergeRiskCorePackageJson);
  const releaseTagName = buildMergeRiskCoreReleaseTagName(declaredVersion);
  const annotatedTagMessage = buildAnnotatedReleaseTagMessage(declaredVersion);
  const gitTagArguments = buildGitAnnotatedTagArguments(releaseTagName, annotatedTagMessage);
  const gitPushArguments = buildGitPushTagArguments(cliOptions.remoteName, releaseTagName);

  assertCurrentDirectoryIsInsideGitWorkTree(monorepoRoot);
  const tagAlreadyExistsLocally = doesLocalGitTagExist(monorepoRoot, releaseTagName);

  if (cliOptions.isDryRun) {
    executeDryRunReport(
      cliOptions,
      declaredVersion,
      releaseTagName,
      tagAlreadyExistsLocally,
      gitTagArguments,
      gitPushArguments,
    );
    return;
  }

  if (tagAlreadyExistsLocally) {
    exitProcessBecauseReleaseTagAlreadyExists(releaseTagName);
  }

  createAnnotatedReleaseTag(monorepoRoot, gitTagArguments, releaseTagName, declaredVersion);
  pushReleaseTagOrPrintManualInstructions(cliOptions, monorepoRoot, gitPushArguments, cliOptions.remoteName, releaseTagName);
};

const main = () => {
  const monorepoRoot = resolveMonorepoRootFromThisModule();
  const cliOptions = parseCliOptions(process.argv.slice(2));
  runMergeRiskCoreReleaseTagWorkflow(cliOptions, monorepoRoot);
};

main();
