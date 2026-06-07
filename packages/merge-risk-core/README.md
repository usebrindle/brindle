# @usebrindle/merge-risk-core

Platform-agnostic merge-risk **scoring engine**: `score()`, YAML config loading, `buildRiskReport`, criteria/mutators/plugins as shipped in the [Brindle](https://github.com/usebrindle/brindle) monorepo under `core/`.

This package does **not** include GitHub/GitLab **implementations** (no Octokit). It **does** export the **`PlatformAdapter`** interface type so custom adapters share the same contract as [`adapters/PlatformAdapter.ts`](../../adapters/PlatformAdapter.ts) in the monorepo.

For adapter responsibilities, base-ref security, and semver notes, see [docs/programmatic-use.md](../../docs/programmatic-use.md).

## Peer dependencies

Install alongside this package (versions should satisfy the ranges below):

- `ajv`
- `js-yaml`
- `micromatch`

## Build (from monorepo root)

```bash
npm ci
npm run build -w @usebrindle/merge-risk-core
```

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

## `PlatformAdapter` (type-only)

Implement this interface in your platform layer; import the type from the same package entry:

```ts
import type { PlatformAdapter } from "@usebrindle/merge-risk-core";
```

## Publishing (maintainers)

Publishing to npm is documented for maintainers in [CONTRIBUTING.md](../../CONTRIBUTING.md#publishing-merge-risk-core-to-npm). Locally, run `npm run build -w @usebrindle/merge-risk-core` then `npm pack -w @usebrindle/merge-risk-core` to validate the tarball before a release tag.
