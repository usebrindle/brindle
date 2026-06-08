# @usebrindle/merge-risk-core

**Deterministic pull-request risk scoring you can embed anywhere.** This package is **@usebrindle/merge-risk-core** — the platform-agnostic Node.js library that turns neutral change data into a numeric risk score, a LOW / MEDIUM / HIGH tier, and an auditable per-criterion breakdown.

## The problem

AI-assisted development and smaller batch sizes mean more pull requests land in review queues than most teams can treat with equal care. Most diffs are small and safe; a minority touch sensitive paths, large churn, or missing signals you care about. Treating every change like a high-stakes review burns attention on noise and leaves less capacity for the changes that actually warrant it.

## What it does

[Brindle](https://github.com/usebrindle/brindle) scores each pull request from **0 to 100** and maps that value into **LOW**, **MEDIUM**, or **HIGH** using **thresholds and weights you declare** in configuration. Scoring is **deterministic**: no generative AI, no LLM calls, no token cost on each run, and every built-in rule you enable is inspectable in code and in the `breakdown` the scorer returns.

## Engine or GitHub Action?

| You want… | Use |
| --- | --- |
| A **library** to call from your own Node services, custom CI, or internal dashboards | **This package** — import `score`, load config from YAML or a plain object, stay in-process. |
| **Merge-risk on GitHub** with workflows, comments, and maintained wiring | The **Brindle GitHub Action** and repo docs — setup lives in the [Brindle](https://github.com/usebrindle/brindle) repository, not in this npm package. |

This package is the **scoring engine** only. It does not ship Octokit, GitHub Actions, or other platform SDKs.

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

const result = score(
  {
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
  },
  scoringConfig,
);

// `result` is a ScoreResult, for example:
// {
//   score: 25,
//   tier: "LOW",
//   breakdown: [
//     {
//       name: "Diff size",
//       score: 25,           // raw 0–100 for this criterion before tier mapping
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

`score` clamps the final value to **0–100**. `tier` is derived from `scoringConfig.thresholds` (`low` inclusive for LOW; above `low` through `medium` inclusive for MEDIUM; above `medium` for HIGH).

## Examples

All examples use **built-in criterion ids** shipped with this package: `diff_size`, `file_patterns`, `branch_age`, `author_seniority`, `test_coverage`, `service_criticality` (see `core/criteria/builtins.ts` in the repo).

### 1. Scoring purely on diff size

Map total added+deleted lines to a 0–100 raw score against a line cap (`max_lines_for_cap`; default **400** if omitted). Here **200** changed lines hit the cap → raw **100** → final score **100** → tier **HIGH** with default thresholds 30 / 60.

```ts
import { loadMergeRiskRepositoryYaml, score } from "@usebrindle/merge-risk-core";

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
    repoSlug: "acme/demo",
    changeNumber: 1,
    headSha: "abc",
    baseRef: "main",
    author: "alice",
    title: "Large refactor",
    body: "",
    labels: [],
    createdAt: "2026-01-01T00:00:00Z",
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

Configured weights **60** (`diff_size`) and **40** (`file_patterns`) sum to **100**. The engine **renormalizes** so active criteria receive percentage shares of the final blend: here **60%** and **40%**. With **100** total lines and `max_lines_for_cap: 200`, diff raw is **50**. Changed paths include `src/app.ts`, which matches `**/*.ts` at configured rule score **80**. Weighted contributions: **30** + **32** → **`result.score === 62`**, **`tier === "HIGH"`**. Each `breakdown` row shows `score` (raw), `weight` (normalized percent), and `weighted` (contribution).

```ts
import { loadMergeRiskRepositoryYaml, score } from "@usebrindle/merge-risk-core";

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
    repoSlug: "acme/demo",
    changeNumber: 2,
    headSha: "def",
    baseRef: "main",
    author: "bob",
    title: "Touch TS",
    body: "",
    labels: [],
    createdAt: "2026-01-01T00:00:00Z",
    files: [{ path: "src/app.ts", status: "modified", additions: 50, deletions: 50 }],
    totalAdditions: 50,
    totalDeletions: 50,
  },
  scoringConfig,
);
// Diff size row: score 50, weight 60, weighted 30
// File patterns row: score 80, weight 40, weighted 32
```

### 3. Tightening or relaxing LOW vs HIGH (thresholds only)

The same underlying **score** can fall in different **tiers** depending on `thresholds` only. With **25** changed lines on `max_lines_for_cap: 100`, the diff raw score is **25**. **`low: 20, medium: 40`** → **MEDIUM** (25 is above `low`). **`low: 30, medium: 60`** → **LOW** (25 is at or below `low`).

```ts
import { loadMergeRiskRepositoryYaml, score } from "@usebrindle/merge-risk-core";

const context = {
  repoSlug: "acme/demo",
  changeNumber: 3,
  headSha: "ghi",
  baseRef: "main",
  author: "carol",
  title: "Small change",
  body: "",
  labels: [],
  createdAt: "2026-01-01T00:00:00Z",
  files: [],
  totalAdditions: 15,
  totalDeletions: 10,
};

const tight = loadMergeRiskRepositoryYaml(`
thresholds: { low: 20, medium: 40 }
criteria:
  diff_size: { weight: 100, options: { max_lines_for_cap: 100 } }
`).scoringConfig;

const relaxed = loadMergeRiskRepositoryYaml(`
thresholds: { low: 30, medium: 60 }
criteria:
  diff_size: { weight: 100, options: { max_lines_for_cap: 100 } }
`).scoringConfig;

score(context, tight); // tier "MEDIUM", score 25
score(context, relaxed); // tier "LOW", score 25
```

### 4. YAML string vs validated object

- **`loadMergeRiskRepositoryYaml(text)`** — parse a full `.merge-risk.yml` document; returns `{ scoringConfig, autoMerge? }`. Use **`scoringConfig`** with `score`.
- **`loadScoringConfigFromMergeRiskYaml(text)`** — same parse/validate path, returns **`ScoringConfig`** directly.
- **`assertValidScoringConfig(parsed)`** — validate an **already-parsed** root mapping (for example from `JSON` or from `parseMergeRiskYamlDocument`). On failure, throws **`MergeRiskConfigError`**.

```ts
import {
  assertValidScoringConfig,
  loadScoringConfigFromMergeRiskYaml,
  score,
} from "@usebrindle/merge-risk-core";

const fromYaml = loadScoringConfigFromMergeRiskYaml(`
thresholds: { low: 30, medium: 60 }
criteria:
  diff_size: { weight: 100 }
`);

const fromObject = assertValidScoringConfig({
  thresholds: { low: 30, medium: 60 },
  criteria: { diff_size: { weight: 100 } },
});

// Both `fromYaml` and `fromObject` are valid ScoringConfig values for `score`.
```

### 5. A criterion self-disables; remaining weights absorb the share

`branch_age` scores from **`classifiedAtIso`** and **`headCommitCommittedAtIso`** on the context (adapter-supplied clock; the criterion does not call `Date.now()`). When the head timestamp cannot be turned into a finite age, the criterion returns **`selfDisable: true`**: it is dropped from the blend and its configured weight is **redistributed** across remaining active criteria.

With **equal weights 50 / 50**, a valid one-hour-old head against `max_age_hours_for_cap: 1` yields raw **100** for age and **50** for diff (50 lines on cap 100) → blended **75**. If age self-disables, only `diff_size` stays active with total configured weight **50** → it receives **100%** of the normalized weight → final **50** instead of **75**; **`disabledCriteria`** contains **`"branch_age"`**.

```ts
import { loadMergeRiskRepositoryYaml, score } from "@usebrindle/merge-risk-core";

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

const base = {
  repoSlug: "acme/demo",
  changeNumber: 4,
  headSha: "jkl",
  baseRef: "main",
  author: "dana",
  title: "Mixed signals",
  body: "",
  labels: [],
  createdAt: "2026-01-01T00:00:00Z",
  files: [],
  totalAdditions: 50,
  totalDeletions: 0,
  classifiedAtIso: "2026-06-07T14:00:00.000Z",
};

const whenAgeWorks = score(
  {
    ...base,
    headCommitCommittedAtIso: "2026-06-07T13:00:00.000Z",
  },
  scoringConfig,
);
// whenAgeWorks.score === 75, whenAgeWorks.tier === "HIGH", disabledCriteria: []

const whenAgeDrops = score(
  {
    ...base,
    headCommitCommittedAtIso: "not-a-parseable-date",
  },
  scoringConfig,
);
// whenAgeDrops.score === 50, whenAgeDrops.tier === "MEDIUM", disabledCriteria: ["branch_age"]
```

## What’s in scope

This package exposes the merge-risk **scoring engine**: `score()`, YAML helpers (`loadMergeRiskRepositoryYaml`, `loadScoringConfigFromMergeRiskYaml`, `parseMergeRiskYamlDocument`, `assertValidScoringConfig`), `buildRiskReport`, and the criteria, mutators, and plugins shipped with Brindle under `core/` in the monorepo. It does **not** include GitHub or GitLab **implementations** (no Octokit). It **does** export the **`PlatformAdapter`** interface type so custom adapters share the same contract as [`adapters/PlatformAdapter.ts`](../../adapters/PlatformAdapter.ts) in the monorepo.

## `PlatformAdapter` (type-only)

Implement this interface in your platform layer; import the type from the same package entry:

```ts
import type { PlatformAdapter } from "@usebrindle/merge-risk-core";
```

For adapter responsibilities, base-ref security, and semver notes, see [docs/programmatic-use.md](../../docs/programmatic-use.md).
