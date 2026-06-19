/**
 * Resolves git author emails for familiarity queries from head commit and GitHub login.
 *
 * @see docs/designs/lld-author-familiarity-criterion.md
 */
import type { HydrateFamiliarityPrContextDependencies } from "./hydrateFamiliarityPrContext.types.js";
import { runGitCommand } from "./gitCommand.js";

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/**
 * GitHub noreply patterns for a login (`login@users.noreply.github.com`).
 */
export const githubNoreplyEmailsForLogin = (authorLogin: string): readonly string[] => {
  const trimmedLogin = authorLogin.trim();
  if (trimmedLogin.length === 0) {
    return [];
  }

  return [`${trimmedLogin}@users.noreply.github.com`];
};

/**
 * Merges head-commit email, GitHub noreply patterns, and optional config overrides.
 */
export const resolveAuthorEmails = (
  headCommitAuthorEmail: string | null | undefined,
  authorLogin: string,
  configAuthorEmails?: readonly string[],
): readonly string[] => {
  const resolvedEmails = new Set<string>();

  const addEmail = (email: string): void => {
    const trimmedEmail = email.trim();
    if (trimmedEmail.length > 0) {
      resolvedEmails.add(normalizeEmail(trimmedEmail));
    }
  };

  if (headCommitAuthorEmail !== null && headCommitAuthorEmail !== undefined) {
    addEmail(headCommitAuthorEmail);
  }

  for (const noreplyEmail of githubNoreplyEmailsForLogin(authorLogin)) {
    addEmail(noreplyEmail);
  }

  if (configAuthorEmails !== undefined) {
    for (const configEmail of configAuthorEmails) {
      addEmail(configEmail);
    }
  }

  return [...resolvedEmails];
};

/**
 * Reads the author email on the head commit via `git log -1 --format=%ae`.
 */
export const resolveHeadCommitAuthorEmail = (
  repositoryRoot: string,
  headRef: string,
  dependencies?: HydrateFamiliarityPrContextDependencies,
): string | null => {
  const runGit = dependencies?.runGitCommand ?? runGitCommand;

  try {
    const authorEmail = runGit(repositoryRoot, ["log", "-1", "--format=%ae", headRef]).trim();
    return authorEmail.length > 0 ? authorEmail : null;
  } catch {
    return null;
  }
};
