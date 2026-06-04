/**
 * Built-in `author_seniority` criterion (runtime only). Options types live in {@link ./authorSeniority.types.js}.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 * @see docs/adrs/0004-pure-criteria-over-hydrated-context.md
 */
import type { Criterion, CriterionResult, PRContext } from "../types.js";

import type { AuthorSeniorityCriterionOptions, AuthorSeniorityRule } from "./authorSeniority.types.js";

/**
 * @param login - Raw login from config or {@link PRContext.author}.
 * @returns Lowercase trimmed string for stable matching; empty string if unusable.
 */
const normalizedLogin = (login: string): string => login.trim().toLowerCase();

/**
 * @param options - `criteria.author_seniority.options` from config; validated in a later schema slice.
 * @returns Sanitized rules with scores clamped to 0–100; invalid entries dropped.
 */
const rulesFromOptions = (options: unknown): AuthorSeniorityRule[] => {
  if (options === null || options === undefined || typeof options !== "object" || Array.isArray(options)) {
    return [];
  }
  const record = options as AuthorSeniorityCriterionOptions;
  const rawRules = record.rules;
  if (!Array.isArray(rawRules)) {
    return [];
  }
  const sanitizedRules: AuthorSeniorityRule[] = [];
  for (const item of rawRules) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const row = item as Record<string, unknown>;
    const loginValue = row.login;
    const scoreValue = row.score;
    if (typeof loginValue !== "string" || normalizedLogin(loginValue) === "") {
      continue;
    }
    if (typeof scoreValue !== "number" || !Number.isFinite(scoreValue)) {
      continue;
    }
    sanitizedRules.push({
      login: loginValue.trim(),
      score: Math.min(100, Math.max(0, scoreValue)),
    });
  }
  return sanitizedRules;
};

/**
 * @param options - Same options object as {@link rulesFromOptions}.
 * @returns Clamped default score for authors who match no rule; 0 when missing or invalid.
 */
const defaultScoreFromOptions = (options: unknown): number => {
  if (options === null || options === undefined || typeof options !== "object" || Array.isArray(options)) {
    return 0;
  }
  const record = options as AuthorSeniorityCriterionOptions;
  const rawDefault = record.default_score;
  if (typeof rawDefault !== "number" || !Number.isFinite(rawDefault)) {
    return 0;
  }
  return Math.min(100, Math.max(0, rawDefault));
};

/**
 * Criterion registered under YAML key `author_seniority`. Scores from configured login tiers over {@link PRContext.author}.
 */
export const authorSeniorityCriterion: Criterion = {
  name: "Author seniority",
  /**
   * @param context - Hydrated {@link PRContext}; uses `author` only for this criterion.
   * @param options - Parsed `criteria.author_seniority.options` (see {@link ./authorSeniority.types.js}).
   * @returns Raw score 0–100 from max of matching rule scores, else `default_score`, else 0 when no rules configured.
   */
  evaluate: (context: PRContext, options: unknown): CriterionResult => {
    const rules = rulesFromOptions(options);
    const authorKey = normalizedLogin(context.author);

    if (rules.length === 0) {
      return {
        score: 0,
        justification: "No author seniority rules configured.",
        detail: { matchedLogin: null as string | null, usedDefault: false },
      };
    }

    let highestMatchingScore = -1;
    let matchedLoginDisplay: string | null = null;
    for (const rule of rules) {
      if (normalizedLogin(rule.login) !== authorKey) {
        continue;
      }
      if (rule.score > highestMatchingScore) {
        highestMatchingScore = rule.score;
        matchedLoginDisplay = rule.login;
      }
    }

    if (highestMatchingScore >= 0) {
      const rawScore = Math.min(100, highestMatchingScore);
      return {
        score: rawScore,
        justification: `Author matched configured login rule (${matchedLoginDisplay}).`,
        detail: { matchedLogin: matchedLoginDisplay, usedDefault: false, matchedRuleScore: rawScore },
      };
    }

    const defaultScore = defaultScoreFromOptions(options);
    return {
      score: defaultScore,
      justification:
        defaultScore > 0
          ? `Author did not match any configured login; using default score (${defaultScore}).`
          : "Author did not match any configured login; default score is zero.",
      detail: { matchedLogin: null, usedDefault: true, defaultScore },
    };
  },
};
