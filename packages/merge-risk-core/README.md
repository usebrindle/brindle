# @usebrindle/merge-risk-core

You need a deterministic pull request risk score, LOW / MEDIUM / HIGH tier labels, and per-criterion justification you can call from your own Node services or runners without LLMs, tokens, or GitHub SDKs in the scoring path. This package is the scoring engine behind Brindle. Brindle is the open-source project that runs merge-risk on GitHub; see the [Brindle](https://github.com/usebrindle/brindle) repository for workflows, the Action, and setup.

## The problem

AI-assisted development and smaller batch sizes mean more pull requests land in review queues than most teams can treat with equal care. Most diffs are small and safe; a minority touch sensitive paths, large churn, or missing signals you care about. Treating every change like a high-stakes review burns attention on noise and leaves less capacity for the changes that actually warrant it.

## What it does

[Brindle](https://github.com/usebrindle/brindle) scores each pull request from 0 to 100 and maps that value into LOW, MEDIUM, or HIGH using thresholds and weights you declare in configuration. Scoring is deterministic: no generative AI, no LLM calls, no token cost on each run, and every built-in rule you enable is inspectable in code and in the `breakdown` the scorer returns.

## Engine or GitHub Action?

| You want… | Use |
| --- | --- |
| A library to call from your own Node services, custom CI, or internal dashboards | This package. Import `score`, load config from YAML or a plain object, stay in-process. |
| Merge-risk on GitHub with workflows, comments, and maintained wiring | The Brindle GitHub Action and repo docs. Setup lives in the [Brindle](https://github.com/usebrindle/brindle) repository, not in this npm package. |

This package is the scoring engine only. It does not ship Octokit, GitHub Actions, or other platform SDKs.

## Install

```bash
npm install @usebrindle/merge-risk-core
```

### Peer dependencies

Install alongside this package (versions should satisfy the ranges in `package.json`):

- `ajv`
- `js-yaml`
- `micromatch`

## Quick start

```ts
import { loadMergeRiskRepositoryYaml, score } from "@usebrindle/merge-risk-core";

const { scoringConfig } = loadMergeRiskRepositoryYaml(`
thresholds: { low: 30, medium: 60 }
criteria:
  diff_size: { weight: 100 }
`);

const prContext = {
  repoSlug: "acme/demo",
  changeNumber: 42,
  headSha: "abc123",
  baseRef: "main",
  author: "alice",
  title: "Fix typo",
  body: "",
  labels: [],
  createdAt: "2026-01-01T00:00:00Z",
  files: [],
  totalAdditions: 50,
  totalDeletions: 50,
};

const result = score(prContext, scoringConfig);

// `result` is a ScoreResult, for example:
// {
//   score: 25,
//   tier: "LOW",
//   breakdown: [
//     {
//       name: "Diff size",
//       score: 25,           // raw 0 to 100 for this criterion before tier mapping
//       weight: 100,         // normalized share of the blend (here 100% of active weight)
//       weighted: 25,        // contribution to the final score
//       justification: "100 total lines changed (additions + deletions)",
//       detail: { lines: 100, cap: 400 },
//     },
//   ],
//   mutatorsApplied: [],     // post-processing multipliers that ran (if any)
//   disabledCriteria: [],  // criteria omitted, disabled in config, or self-disabled
// }
```

`score` clamps the final value to 0 through 100. `tier` comes from `scoringConfig.thresholds`: at or below `low` is LOW, above `low` through `medium` inclusive is MEDIUM, above `medium` is HIGH.

## Examples

All examples use built-in criterion ids shipped with this package: `diff_size`, `file_patterns`, `branch_age`, `author_seniority`, `test_coverage`, `service_criticality` (see `core/criteria/builtins.ts` in the repo).

```ts
import { loadMergeRiskRepositoryYaml, score } from "@usebrindle/merge-risk-core";

const basePullRequest = {
  repoSlug: "acme/demo",
  baseRef: "main",
  author: "alice",
  body: "",
  labels: [],
  createdAt: "2026-01-01T00:00:00Z",
} as const;
```

### 1. Scoring purely on diff size

Total added plus deleted lines map to a raw score from 0 to 100 against a line cap (`max_lines_for_cap`; the default is 400 if omitted). With `max_lines_for_cap: 200`, 200 changed lines hit the cap, so the raw diff score is 100, the final score is 100, and the tier is HIGH under default thresholds 30 and 60.

```ts
const { scoringConfig } = loadMergeRiskRepositoryYaml(`
thresholds: { low: 30, medium: 60 }
criteria:
  diff_size:
    weight: 100
    options:
      max_lines_for_cap: 200
`);

const result = score(
  {
    ...basePullRequest,
    changeNumber: 1,
    headSha: "abc",
    title: "Large refactor",
    files: [],
    totalAdditions: 120,
    totalDeletions: 80,
  },
  scoringConfig,
);
// result.score === 100, result.tier === "HIGH"
// breakdown[0]: raw diff score 100, weight 100, weighted 100
```

### 2. Two criteria with weights (how the blend splits)

Configured weights 60 for `diff_size` and 40 for `file_patterns` sum to 100. The engine renormalizes so active criteria receive percentage shares of the final blend, here 60% and 40%. With 100 total lines and `max_lines_for_cap: 200`, the diff raw score is 50. Changed paths include `src/app.ts`, which matches `**/*.ts` at configured rule score 80. Weighted contributions are 30 and 32, so `result.score` is 62 and `tier` is `"HIGH"`. Each `breakdown` row shows `score` (raw), `weight` (normalized percent), and `weighted` (contribution).

```ts
const { scoringConfig } = loadMergeRiskRepositoryYaml(`
thresholds: { low: 30, medium: 60 }
criteria:
  diff_size:
    weight: 60
    options:
      max_lines_for_cap: 200
  file_patterns:
    weight: 40
    options:
      patterns:
        - glob: "**/*.ts"
          score: 80
`);

const result = score(
  {
    ...basePullRequest,
    changeNumber: 2,
    headSha: "def",
    title: "Touch TS",
    files: [{ path: "src/app.ts", status: "modified", additions: 50, deletions: 50 }],
    totalAdditions: 50,
    totalDeletions: 50,
  },
  scoringConfig,
);
// Diff size row: score 50, weight 60, weighted 30
// File patterns row: score 80, weight 40, weighted 32
```

### 3. A criterion self-disables; remaining weights absorb the share

`branch_age` scores from `classifiedAtIso` and `headCommitCommittedAtIso` on the context (adapter-supplied clock; the criterion does not call `Date.now()`). When the head timestamp cannot be turned into a finite age, the criterion returns `selfDisable: true`: it is dropped from the blend and its configured weight is redistributed across remaining active criteria.

With equal weights 50 and 50, a valid one-hour-old head against `max_age_hours_for_cap: 1` yields raw 100 for age and 50 for diff (50 lines on cap 100), so the blend is 75. If age self-disables, only `diff_size` stays active with total configured weight 50, so it receives 100% of the normalized weight and the final score is 50 instead of 75. `disabledCriteria` contains `"branch_age"`.

```ts
const { scoringConfig } = loadMergeRiskRepositoryYaml(`
thresholds: { low: 30, medium: 60 }
criteria:
  diff_size:
    weight: 50
    options:
      max_lines_for_cap: 100
  branch_age:
    weight: 50
    options:
      max_age_hours_for_cap: 1
`);

const withBranchAge = {
  ...basePullRequest,
  changeNumber: 4,
  headSha: "jkl",
  title: "Mixed signals",
  files: [],
  totalAdditions: 50,
  totalDeletions: 0,
  classifiedAtIso: "2026-06-07T14:00:00.000Z",
};

const whenAgeWorks = score(
  { ...withBranchAge, headCommitCommittedAtIso: "2026-06-07T13:00:00.000Z" },
  scoringConfig,
);
// whenAgeWorks.score === 75, whenAgeWorks.tier === "HIGH", disabledCriteria: []

const whenAgeDrops = score(
  { ...withBranchAge, headCommitCommittedAtIso: "not-a-parseable-date" },
  scoringConfig,
);
// whenAgeDrops.score === 50, whenAgeDrops.tier === "MEDIUM", disabledCriteria: ["branch_age"]
```

## What’s in scope

This package exposes the merge-risk scoring engine: `score()`, YAML helpers (`loadMergeRiskRepositoryYaml`, `loadScoringConfigFromMergeRiskYaml`, `parseMergeRiskYamlDocument`, `assertValidScoringConfig`), `buildRiskReport`, and the criteria, mutators, and plugins shipped with Brindle under `core/` in the monorepo. It does not include GitHub or GitLab implementations (no Octokit). It does export the `PlatformAdapter` interface type so custom adapters share the same contract as [`adapters/PlatformAdapter.ts`](../../adapters/PlatformAdapter.ts) in the monorepo.

## `PlatformAdapter` (type-only)

Implement this interface in your platform layer; import the type from the same package entry:

```ts
import type { PlatformAdapter } from "@usebrindle/merge-risk-core";
```

For adapter responsibilities, base-ref security, and semver notes, see [docs/programmatic-use.md](../../docs/programmatic-use.md).
