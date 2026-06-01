# Contributing to Brindle

Brindle is MIT licensed and built in the open. Contributions are welcome.

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

## Project layout

Brindle is platform-agnostic at its core. The split matters, so keep contributions in the right layer.

Target layout (from the [LLD](docs/designs/lld-merge-risk-classifier.md); directories will appear as the scaffold lands):

- `core/` … the platform-agnostic scoring engine, criteria, mutators, coverage adapters, config, and reporting model. Depends on no platform SDK. This is what makes Brindle portable across GitHub, GitLab, and Bitbucket. See [ADR 0007](docs/adrs/0007-platform-adapter-boundary.md).
- `adapters/` … one implementation of `PlatformAdapter` per platform. The only place that knows which platform it is talking to.
- `extensions/` … the native CI wrapper per platform (GitHub Action first).

Until that layout exists in-tree, the repo may still hold a minimal root `src/` and `test/`; new work should follow the LLD so we do not paint ourselves into a GitHub-shaped corner.

A contribution that puts platform-specific code in `core/`, or executes content from a pull request head, will be asked to change. See [ADR 0001](docs/adrs/0001-no-pr-head-execution.md) and [ADR 0004](docs/adrs/0004-pure-criteria-over-hydrated-context.md) for the constraints that shape this.

## Tooling status

**ESLint** (flat config, `typescript-eslint`) is configured; use `npm run lint` / `npm run lint:fix`. **Vitest** runs via `npm run test` / `npm run test:watch`; CI runs tests **with coverage** (`lcov` in `coverage/`). **Husky** + **lint-staged** run on **pre-commit** for staged TypeScript: ESLint fix, then Vitest related. **SonarCloud** analysis runs via a dedicated workflow on same-repo PRs and on **`main`** (see **SonarCloud** below).

## SonarCloud

Static analysis runs in [`.github/workflows/sonar.yml`](.github/workflows/sonar.yml) using [`sonar-project.properties`](sonar-project.properties).

1. In [SonarCloud](https://sonarcloud.io), import **`usebrindle/brindle`** (or create a project and copy the **organization** and **project key** into `sonar-project.properties` so they match the UI exactly).
2. In GitHub: **Settings → Secrets and variables → Actions**, add **`SONAR_TOKEN`** from SonarCloud ([token docs](https://docs.sonarsource.com/sonarqube-cloud/managing-your-account/managing-tokens/)). Prefer an **organization-level** secret if your org policy allows it.
3. The workflow runs **`npm ci`**, **`npm run test -- --coverage`** (for `coverage/lcov.info`), then **`SonarSource/sonarqube-scan-action`** at release **v8.1.0** (pinned by full commit SHA in [`.github/workflows/sonar.yml`](.github/workflows/sonar.yml)). The scan step passes **`GITHUB_TOKEN`** (with `pull-requests: read` on the job) so Sonar can tie the run to the PR for decoration, plus **`SONAR_TOKEN`**. **Fork pull requests are skipped** so the job does not fail when secrets are unavailable.

## Pull requests

Brindle's own history is a public trust artifact. Write PR descriptions that explain what the change does and why, and reference the relevant ADR where one applies. The care goes into the description, not just the diff.
