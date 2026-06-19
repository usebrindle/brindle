/**
 * Resolve `git` from fixed install locations (never via attacker-controlled PATH).
 *
 * @see docs/adrs/0010-contextual-analysis-at-head.md
 */
import { existsSync } from "node:fs";

const TRUSTED_GIT_EXECUTABLE_PATHS: readonly string[] =
  process.platform === "win32"
    ? [
        "C:\\Program Files\\Git\\cmd\\git.exe",
        "C:\\Program Files\\Git\\bin\\git.exe",
      ]
    : ["/usr/bin/git", "/usr/local/bin/git", "/opt/homebrew/bin/git"];

/**
 * @returns Absolute path to a trusted `git` executable.
 * @throws When `git` is not installed in any known system location.
 */
export const resolveGitExecutable = (): string => {
  for (const trustedGitExecutablePath of TRUSTED_GIT_EXECUTABLE_PATHS) {
    if (existsSync(trustedGitExecutablePath)) {
      return trustedGitExecutablePath;
    }
  }
  throw new Error(
    `git executable not found in trusted locations: ${TRUSTED_GIT_EXECUTABLE_PATHS.join(", ")}`,
  );
};
