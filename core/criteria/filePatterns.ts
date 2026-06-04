/**
 * Built-in `file_patterns` criterion (runtime only). Options types live in {@link ./filePatterns.types.js}.
 *
 * @see docs/designs/lld-merge-risk-classifier.md
 * @see docs/adrs/0004-pure-criteria-over-hydrated-context.md
 */
import micromatch from "micromatch";

import type { Criterion, CriterionResult, PRContext } from "../types.js";

import type { FilePatternRule, FilePatternsCriterionOptions } from "./filePatterns.types.js";

const micromatchOptions = { dot: true } as const;

/**
 * @param options - `criteria.file_patterns.options` from config; validated in a later schema slice.
 * @returns Sanitized rules with scores clamped to 0–100; invalid entries dropped.
 */
const rulesFromOptions = (options: unknown): FilePatternRule[] => {
  if (options === null || options === undefined || typeof options !== "object" || Array.isArray(options)) {
    return [];
  }
  const record = options as FilePatternsCriterionOptions;
  const rawPatterns = record.patterns;
  if (!Array.isArray(rawPatterns)) {
    return [];
  }
  const sanitizedRules: FilePatternRule[] = [];
  for (const item of rawPatterns) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const row = item as Record<string, unknown>;
    const globValue = row.glob;
    const scoreValue = row.score;
    if (typeof globValue !== "string" || globValue.trim() === "") {
      continue;
    }
    if (typeof scoreValue !== "number" || !Number.isFinite(scoreValue)) {
      continue;
    }
    sanitizedRules.push({
      glob: globValue.trim(),
      score: Math.min(100, Math.max(0, scoreValue)),
    });
  }
  return sanitizedRules;
};

const changedPathsFromContext = (context: PRContext): string[] =>
  context.files.map((changedFile) => changedFile.path);

/**
 * @param paths - Changed file paths from {@link PRContext.files}.
 * @param globPattern - Single micromatch pattern.
 * @returns True when any path matches the glob.
 */
const anyPathMatchesGlob = (paths: string[], globPattern: string): boolean =>
  paths.some((pathValue) => micromatch.isMatch(pathValue, globPattern, micromatchOptions));

/**
 * Criterion registered under YAML key `file_patterns`. Scores from configured globs over changed paths.
 */
export const filePatternsCriterion: Criterion = {
  name: "File patterns",
  /**
   * @param context - Hydrated {@link PRContext}; uses `files[].path` only.
   * @param options - Parsed `criteria.file_patterns.options` (see {@link ./filePatterns.types.js}).
   * @returns Raw score 0–100 from max of matching rule scores (MVP), with matched glob detail.
   */
  evaluate: (context: PRContext, options: unknown): CriterionResult => {
    const rules = rulesFromOptions(options);
    const paths = changedPathsFromContext(context);
    if (rules.length === 0) {
      return {
        score: 0,
        justification: "No file pattern rules configured.",
        detail: { matchedGlobs: [] as string[] },
      };
    }
    if (paths.length === 0) {
      return {
        score: 0,
        justification: "No changed files to match against pattern rules.",
        detail: { matchedGlobs: [] as string[] },
      };
    }

    let highestMatchingScore = 0;
    const matchedGlobs: string[] = [];
    for (const rule of rules) {
      if (!anyPathMatchesGlob(paths, rule.glob)) {
        continue;
      }
      if (!matchedGlobs.includes(rule.glob)) {
        matchedGlobs.push(rule.glob);
      }
      if (rule.score > highestMatchingScore) {
        highestMatchingScore = rule.score;
      }
    }

    if (highestMatchingScore === 0) {
      return {
        score: 0,
        justification: "No changed files matched configured patterns.",
        detail: { matchedGlobs: [] as string[] },
      };
    }

    const rawScore = Math.min(100, highestMatchingScore);
    return {
      score: rawScore,
      justification: `Changed files matched sensitive pattern(s): ${matchedGlobs.join(", ")}`,
      detail: { matchedGlobs, highestRuleScore: highestMatchingScore },
    };
  },
};
