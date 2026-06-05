# @usebrindle/merge-risk-core

Platform-agnostic merge-risk **scoring engine**: `score()`, YAML config loading, `buildRiskReport`, criteria/mutators/plugins as shipped in the [Brindle](https://github.com/usebrindle/brindle) monorepo under `core/`.

This package does **not** include GitHub/GitLab adapters or the GitHub Action. Use those from the main repo or future platform packages.

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

## Publishing

Use `npm pack` after `npm run build` to validate the tarball. Automated publishes are added via the repository release workflow (see root README once merged).
