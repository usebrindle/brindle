/**
 * Built-in `junior_author` mutator: multiplies the running score when the change author is in a configured login set.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 * @see docs/adrs/0004-pure-criteria-over-hydrated-context.md
 */
import type { PRContext } from "../types.js";

import type { JuniorAuthorMutatorOptions } from "./juniorAuthor.types.js";
import { createConditionalMultiplierMutator } from "./mutatorPrimitives.js";

const normalizedLogin = (login: string): string => login.trim().toLowerCase();

/**
 * @param options - `mutators.junior_author.options`; validated in a later schema slice.
 * @returns Sanitized non-empty logins (matching is case-insensitive).
 */
const juniorLoginsFromOptions = (options: unknown): string[] => {
  if (options === null || options === undefined || typeof options !== "object" || Array.isArray(options)) {
    return [];
  }
  const record = options as JuniorAuthorMutatorOptions;
  const raw = record.logins;
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      continue;
    }
    const trimmed = item.trim();
    if (trimmed === "") {
      continue;
    }
    out.push(trimmed);
  }
  return out;
};

const authorMatchesJuniorLogins = (author: string, options: unknown): boolean => {
  const authorKey = normalizedLogin(author);
  if (authorKey === "") {
    return false;
  }
  const logins = juniorLoginsFromOptions(options);
  for (const login of logins) {
    if (normalizedLogin(login) === authorKey) {
      return true;
    }
  }
  return false;
};

/**
 * Registered under YAML id `junior_author`. Multiplies when {@link PRContext.author} matches any configured login.
 */
export const juniorAuthorMutator = createConditionalMultiplierMutator({
  name: "Junior author",
  applies: (context: PRContext, options: unknown): boolean =>
    authorMatchesJuniorLogins(context.author, options),
});
