# Brindle

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node.js-%3E%3D20-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Platform-agnostic merge-risk classifier and native CI extensions (GitHub first, then GitLab and Bitbucket). This repository holds the open scoring path, adapters, and docs; see [ADR 0008](docs/adrs/0008-packaging-and-open-core.md) for packaging and open-core boundaries.

## Development

Requires **Node.js 20+** (see `engines` in [`package.json`](package.json), aligned with the GitHub Action runtime in the [LLD](docs/designs/lld-merge-risk-classifier.md)).

```bash
npm ci
npm run typecheck
```

## Documentation

- [Architecture Decision Records](docs/adrs/)
- [Low-level design: merge risk classifier](docs/designs/lld-merge-risk-classifier.md)

## Tooling status

Linting, tests (Vitest), git hooks, and SonarCloud are added in follow-up PRs. CI and dynamic badges (build, coverage, quality gate) will appear once those workflows exist on `main`.
