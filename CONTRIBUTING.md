# Contributing to Brindle

Brindle is MIT licensed and built in the open. Contributions are welcome.

## Development

Requires **Node.js 20+** (see `engines` in [`package.json`](package.json), aligned with the GitHub Action runtime in the [LLD](docs/designs/lld-merge-risk-classifier.md)).

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npm run test:coverage   # same as CI test step (lcov for Sonar)
```

## Tests and coverage

**Vitest** drives unit tests under [`test/`](test/). **`npm run test:coverage`** runs Vitest with **v8 coverage**, writes **`coverage/lcov.info`** (for SonarCloud) and a text summary. CI runs **`npm run test -- --coverage`** on every push and PR.

Coverage is **scoped in [`vitest.config.ts`](vitest.config.ts)** to **`core/**/*.ts`** (runtime scoring code). **`core/types.ts` is excluded** (type-only). **`adapters/`** is still analyzed by Sonar as sources but is not in the Vitest coverage set until it contains executable implementations. Tighten or add thresholds later as the surface grows.

## Project layout

Brindle is platform-agnostic at its core. The split matters, so keep contributions in the right layer.

Target layout (from the [LLD](docs/designs/lld-merge-risk-classifier.md)):

- `core/` … the platform-agnostic scoring engine, criteria, mutators, coverage adapters, config, and reporting model. Depends on no platform SDK. This is what makes Brindle portable across GitHub, GitLab, and Bitbucket. See [ADR 0007](docs/adrs/0007-platform-adapter-boundary.md).
- `adapters/` … one implementation of `PlatformAdapter` per platform. The only place that knows which platform it is talking to.
- `extensions/` … the native CI wrapper per platform (GitHub Action first).

The LLD layout (`core/`, `adapters/`, `extensions/`) lives in-tree; new work should stay in the right layer so we do not paint ourselves into a GitHub-shaped corner.

A contribution that puts platform-specific code in `core/`, or executes content from a pull request head, will be asked to change. See [ADR 0001](docs/adrs/0001-no-pr-head-execution.md) and [ADR 0004](docs/adrs/0004-pure-criteria-over-hydrated-context.md) for the constraints that shape this.

## TypeScript style

Keep **single responsibility** per function: one decision, one transformation, or one side effect (the scorer favors tiny helpers over long pipelines in one block).

Prefer **short bodies** (on the order of **ten lines or fewer** per function, blanks and closing braces not counted as “work”). When a function grows, extract a named helper rather than nesting more logic.

Prefer **`const` arrow functions** for top-level helpers and exports unless a hoisted declaration or generator genuinely reads clearer.

Cursor loads the same expectations from [`.cursor/rules/typescript-style.mdc`](.cursor/rules/typescript-style.mdc) when you work on `*.ts` files; keep that rule and this section in sync.

## Documentation (JSDoc)

Use **JSDoc** so public contracts stay readable in the editor and for future API docs.

- **File-level** `/** ... */` on non-trivial modules: what the file is responsible for; **`@see`** to the [LLD](docs/designs/lld-merge-risk-classifier.md) or an ADR when the file encodes an accepted decision.
- **`export` functions and constants**: describe purpose; use **`@param`** and **`@returns`** when the signature alone does not carry the contract.
- **`export interface` / `export type`**: document intent and invariants; use **`@see`** for cross-repo specs.
- **Interface methods**: at least a one-line description when behavior or async contracts are not obvious.

Agent-side detail lives in [`.cursor/rules/jsdoc.mdc`](.cursor/rules/jsdoc.mdc); keep it aligned with this section.

## Tooling status

**ESLint** (flat config, `typescript-eslint`) is configured; use `npm run lint` / `npm run lint:fix`. **Vitest** runs via `npm run test` / `npm run test:watch`; CI runs tests **with coverage** (`lcov` in `coverage/`). **SonarCloud** analysis runs via a dedicated workflow on same-repo PRs and on **`main`** (see **SonarCloud** below).

On **commit**, **Husky** runs **lint-staged** on staged `*.{ts,tsx}`: **`eslint --fix`**, then **`vitest related --run`** for a fast, file-scoped test pass.

## SonarCloud

Static analysis runs in [`.github/workflows/sonar.yml`](.github/workflows/sonar.yml) using [`sonar-project.properties`](sonar-project.properties).

1. In [SonarCloud](https://sonarcloud.io), import **`usebrindle/brindle`** (or create a project and copy the **organization** and **project key** into `sonar-project.properties` so they match the UI exactly).
2. In GitHub: **Settings → Secrets and variables → Actions**, add **`SONAR_TOKEN`** from SonarCloud ([token docs](https://docs.sonarsource.com/sonarqube-cloud/managing-your-account/managing-tokens/)). Prefer an **organization-level** secret if your org policy allows it.
3. The workflow runs **`npm ci`**, **`npm run test -- --coverage`** (for `coverage/lcov.info`), then **`SonarSource/sonarqube-scan-action`** at release **v8.1.0** (pinned by full commit SHA in [`.github/workflows/sonar.yml`](.github/workflows/sonar.yml)). The scan step passes **`GITHUB_TOKEN`** (with `pull-requests: read` on the job) so Sonar can tie the run to the PR for decoration, plus **`SONAR_TOKEN`**. **Fork pull requests are skipped** so the job does not fail when secrets are unavailable.

## Pull requests

Brindle's own history is a public trust artifact. Write PR descriptions that explain what the change does and why, and reference the relevant ADR where one applies. The care goes into the description, not just the diff.
