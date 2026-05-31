# Brindle

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node.js-%3E%3D20-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![CI](https://github.com/usebrindle/brindle/actions/workflows/ci.yml/badge.svg)](https://github.com/usebrindle/brindle/actions/workflows/ci.yml)
[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=usebrindle_brindle&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=usebrindle_brindle)

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

## SonarCloud

Static analysis runs in [`.github/workflows/sonar.yml`](.github/workflows/sonar.yml) using [`sonar-project.properties`](sonar-project.properties).

1. In [SonarCloud](https://sonarcloud.io), import **`usebrindle/brindle`** (or create a project and copy the **organization** and **project key** into `sonar-project.properties` so they match the UI exactly).
2. In GitHub: **Settings → Secrets and variables → Actions**, add **`SONAR_TOKEN`** from SonarCloud ([token docs](https://docs.sonarsource.com/sonarqube-cloud/managing-your-account/managing-tokens/)). Prefer an **organization-level** secret if your org policy allows it.
3. The workflow runs **`npm ci`**, **`npm run test -- --coverage`** (for `coverage/lcov.info`), then **`SonarSource/sonarqube-scan-action`** at release **v8.1.0** (pinned by full commit SHA in [`.github/workflows/sonar.yml`](.github/workflows/sonar.yml)). **Fork pull requests are skipped** so the job does not fail when secrets are unavailable.

The Quality Gate badge above appears once the SonarCloud project exists and the first analysis succeeds.

## Documentation

- [Architecture Decision Records](docs/adrs/)
- [Low-level design: merge risk classifier](docs/designs/lld-merge-risk-classifier.md)

## Tooling status

**ESLint** (flat config, `typescript-eslint`) is configured; use `npm run lint` / `npm run lint:fix`. **Vitest** runs via `npm run test` / `npm run test:watch`; CI runs tests **with coverage** (`lcov` in `coverage/`). **Husky** + **lint-staged** run on **pre-commit** for staged TypeScript: ESLint fix, then Vitest related. **SonarCloud** analysis runs via a dedicated workflow on same-repo PRs and on **`main`** (see **SonarCloud** above).
