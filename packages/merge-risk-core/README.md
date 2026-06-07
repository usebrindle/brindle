# @usebrindle/merge-risk-core

This package is the platform-agnostic, deterministic merge-risk scoring engine behind Brindle. It is for teams and developers who want to embed pull-request risk scoring in their own Node.js tooling rather than using the GitHub Action.

**What is Brindle?** Brindle scores pull requests in CI so low-risk work can move while risky changes wait for a human; the product, documentation, and Action live in the [Brindle](https://github.com/usebrindle/brindle) repository.

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
