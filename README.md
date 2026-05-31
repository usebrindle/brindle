# Brindle

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node.js-%3E%3D20-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![CI](https://github.com/usebrindle/brindle/actions/workflows/ci.yml/badge.svg)](https://github.com/usebrindle/brindle/actions/workflows/ci.yml)

Platform-agnostic merge-risk classifier and native CI extensions (GitHub first, then GitLab and Bitbucket). This repository holds the open scoring path, adapters, and docs; see [ADR 0008](docs/adrs/0008-packaging-and-open-core.md) for packaging and open-core boundaries.

## Development

Requires **Node.js 20+** (see `engines` in [`package.json`](package.json), aligned with the GitHub Action runtime in the [LLD](docs/designs/lld-merge-risk-classifier.md)).

```bash
npm ci
npm run typecheck
npm run lint
npm run test
```

Coverage (lcov under `coverage/`) is produced when you run `npm run test -- --coverage` (CI does this on every run).

On **commit**, **Husky** runs **lint-staged** on staged `*.{ts,tsx}`: **`eslint --fix`**, then **`vitest related --run`** for a fast, file-scoped test pass.

## Documentation

- [Architecture Decision Records](docs/adrs/)
- [Low-level design: merge risk classifier](docs/designs/lld-merge-risk-classifier.md)

## Tooling status

**ESLint** (flat config, `typescript-eslint`) is configured; use `npm run lint` / `npm run lint:fix`. **Vitest** runs via `npm run test` / `npm run test:watch`; CI runs tests **with coverage** (`lcov` in `coverage/` for a future Sonar slice). **Husky** + **lint-staged** run on **pre-commit** for staged TypeScript: ESLint fix, then Vitest related. **SonarCloud** is still a follow-up PR.
