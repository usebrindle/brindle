# @usebrindle/merge-risk-core

AI-assisted development tends to produce more pull requests than humans can review at the same pace. Most of those changes are small and safe; a few are genuinely risky. Reviewing every PR with the same level of scrutiny burns reviewer attention on the safe ones and leaves less for the changes that actually need it.

**Brindle** is a merge-risk system that reads each pull request and assigns a single score from **0 to 100**, then maps that score into **LOW**, **MEDIUM**, or **HIGH** tiers using rules you define in configuration. Low-risk tiers can move forward automatically where you allow it; riskier tiers wait for a human. The scoring is **deterministic**: no generative AI, no LLM calls, no per-run token cost, and every rule that influenced a score is one you can audit.

**This package (`@usebrindle/merge-risk-core`)** is the platform-agnostic scoring engine only: the library you embed in your own **Node.js** tooling (custom CI, internal dashboards, or adapters you maintain yourself). If you just want merge-risk scoring on **GitHub** with minimal setup, use the **Brindle GitHub Action** instead; setup, workflow examples, and product docs live in the [Brindle](https://github.com/usebrindle/brindle) repository.

```bash
npm install @usebrindle/merge-risk-core
```

For adapter responsibilities, base-ref security, and semver notes, see [docs/programmatic-use.md](../../docs/programmatic-use.md).

## Peer dependencies

Install alongside this package (versions should satisfy the ranges below):

- `ajv`
- `js-yaml`
- `micromatch`

## Minimal usage

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
    changeNumber: 1,
    headSha: "abc",
    baseRef: "main",
    author: "alice",
    title: "x",
    body: "",
    labels: [],
    createdAt: "2026-01-01T00:00:00Z",
    files: [],
    totalAdditions: 0,
    totalDeletions: 0,
  },
  scoringConfig,
);
```

This package exposes the merge-risk **scoring engine**: `score()`, YAML config loading, `buildRiskReport`, and the criteria, mutators, and plugins shipped with Brindle under `core/`. It does **not** include GitHub or GitLab **implementations** (no Octokit). It **does** export the **`PlatformAdapter`** interface type so custom adapters share the same contract as [`adapters/PlatformAdapter.ts`](../../adapters/PlatformAdapter.ts) in the monorepo.

## `PlatformAdapter` (type-only)

Implement this interface in your platform layer; import the type from the same package entry:

```ts
import type { PlatformAdapter } from "@usebrindle/merge-risk-core";
```
