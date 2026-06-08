# Contributing to Brindle

Brindle is MIT licensed and built in the open. Contributions are welcome.

## Development

Requires **Node.js 22+** (see `engines` in [`package.json`](package.json); supported LTS, not EOL). **CI** and the **published GitHub Action** run on **Node 24** (`node24`); use 24 locally if you want an exact match with CI (see the [LLD](docs/designs/lld-merge-risk-classifier.md)).

```bash
npm ci
npm run build:merge-risk-core   # required before npm test (public API contract test reads packages/merge-risk-core/dist)
npm run typecheck
npm run lint
npm run test
npm run test:coverage   # same as CI test step (lcov for Sonar)
npm run build:github-action   # refresh extensions/github-action/dist after editing the Action
```

The **`@usebrindle/merge-risk-core`** workspace package is built with **tsup**; CI builds it **before** Vitest. Contract tests in [`test/merge-risk-core-public-api.test.ts`](test/merge-risk-core-public-api.test.ts) import the built `dist/` entry. Programmatic usage and adapter contracts are documented in [docs/programmatic-use.md](docs/programmatic-use.md).

## Tests and coverage

**Vitest** drives unit tests under [`test/`](test/). **`npm run test:coverage`** runs Vitest with **v8 coverage**, writes **`coverage/lcov.info`** (for SonarCloud) and a text summary. CI runs **`npm run test -- --coverage`** on every push and PR.

Coverage is **scoped in [`vitest.config.ts`](vitest.config.ts)** to **`core/**/*.ts`** and **`adapters/**/*.ts`**, with **`core/types.ts`**, **`core/scorer.types.ts`**, **`core/report.types.ts`**, **`core/criteria/diffSize.types.ts`**, **`core/criteria/testCoverage.types.ts`**, **`adapters/PlatformAdapter.ts`**, and **`adapters/github/githubAdapter.types.ts`** excluded (type-only modules). Tighten or add thresholds later as the surface grows.

**Extensions (`extensions/**/*.ts`)** are not in that coverage include list yet; the GitHub Action shipped before a Vitest suite. Treat **adding tests plus extending `coverage.include` (and, if desired, `sonar.sources` in [`sonar-project.properties`](sonar-project.properties))** as planned work so CI extensions meet the same bar as `core/` and `adapters/`.

## Project layout

Brindle is platform-agnostic at its core. The split matters, so keep contributions in the right layer.

Target layout (from the [LLD](docs/designs/lld-merge-risk-classifier.md)):

- `schema/` … JSON Schema for merge-risk config (YAML on disk is validated against it in `core/config.ts`).
- `core/` … the platform-agnostic scoring engine, criteria, mutators, coverage adapters, config, and reporting model. Depends on no platform SDK. This is what makes Brindle portable across GitHub, GitLab, and Bitbucket. See [ADR 0007](docs/adrs/0007-platform-adapter-boundary.md).
- `adapters/` … one implementation of `PlatformAdapter` per platform. The only place that knows which platform it is talking to. GitHub lives under `adapters/github/` (REST client + `GitHubAdapter`).
- `extensions/` … the native CI wrapper per platform (GitHub Action first). The shipping bundle lives under `extensions/github-action/dist/` and is produced with **`npm run build:github-action`** (`@vercel/ncc`). CI fails if `dist/` is out of date relative to the TypeScript sources.
- `packages/merge-risk-core/` … npm workspace that bundles `core/` (plus the **`PlatformAdapter`** type) for **`@usebrindle/merge-risk-core`**. See [docs/programmatic-use.md](docs/programmatic-use.md).

The LLD layout (`core/`, `adapters/`, `extensions/`) lives in-tree; new work should stay in the right layer so we do not paint ourselves into a GitHub-shaped corner.

A contribution that puts platform-specific code in `core/`, or executes content from a pull request head, will be asked to change. See [ADR 0001](docs/adrs/0001-no-pr-head-execution.md) and [ADR 0004](docs/adrs/0004-pure-criteria-over-hydrated-context.md) for the constraints that shape this.

Publishing merge-risk results on GitHub (`GitHubAdapter.writeResult`) uses **Check Runs** and optionally **PR comments** via Octokit (see [ADR 0003](docs/adrs/0003-check-runs-over-commit-statuses.md)). The bundled Action defaults to **informational** check conclusions (`success` for all tiers) so advisory merge risk does not fail required checks; strict tier-to-conclusion mapping is opt-in (see `extensions/github-action/action.yml`). When `.merge-risk.yml` enables **native auto-merge** (`auto_merge.enabled: true`), the Action also calls GitHub’s **`enablePullRequestAutoMerge`** GraphQL mutation (never the merge REST endpoint; see [ADR 0002](docs/adrs/0002-native-auto-merge.md)). The workflow token then needs **`contents: write`** in addition to **`checks: write`** and **`pull-requests: write`**, and the repository must allow auto-merge in GitHub settings.

## TypeScript style

Keep **single responsibility** per function: one decision, one transformation, or one side effect (the scorer favors tiny helpers over long pipelines in one block).

Prefer **short bodies** (on the order of **ten lines or fewer** per function, blanks and closing braces not counted as “work”). When a function grows, extract a named helper rather than nesting more logic.

Prefer **`const` arrow functions** for top-level helpers and exports unless a hoisted declaration or generator genuinely reads clearer.

**Names:** prefer **long, explicit identifiers** for locals, parameters, and helpers so call sites read like prose. Avoid cryptic abbreviations (`mcfg`, `ctx`) and vague placeholders (`tmp`, `obj`) in non-trivial code paths. When a value is a criterion or mutator **implementation**, prefer names like **`criterionImplementation`** / **`mutatorImplementation`** (or include the id in the name) over a bare **`impl`**. Match vocabulary from the [LLD](docs/designs/lld-merge-risk-classifier.md) and shared types in `core/types.ts`.

**Types vs implementation:** do not define criterion- or module-specific `export type` / `export interface` in the same file as that module’s runtime code. Use a sibling **`*.types.ts` with the same stem** (for example `core/criteria/diffSize.ts` + `core/criteria/diffSize.types.ts`). Keep **`core/types.ts`** for the shared platform-neutral model only.

Cursor loads the same expectations from [`.cursor/rules/typescript-style.mdc`](.cursor/rules/typescript-style.mdc) and [`.cursor/rules/naming.mdc`](.cursor/rules/naming.mdc) when you work on `*.ts` files; keep those rules and this section in sync.

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

## Dogfooding

This repo exercises merge-risk on its own PRs via committed [`.merge-risk.yml`](.merge-risk.yml). **Canonical** description of what is enabled (criteria, mutators, declarative rules, trusted plugins, labels, and paths) is the **Dogfood** bullet under [Brindle repository snapshot (this spec vs shipped code)](docs/designs/lld-merge-risk-classifier.md#brindle-repository-snapshot-this-spec-vs-shipped-code) in the LLD. A short index with the same pointers lives in [docs/dogfood/README.md](docs/dogfood/README.md). Do not duplicate that narrative here.

## Publishing merge-risk-core to npm

Maintainers only: these steps publish [`@usebrindle/merge-risk-core`](https://www.npmjs.com/package/@usebrindle/merge-risk-core) from this repo. Consumers only need `npm install`; they do not use tags.

CI uses **[npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)** (OIDC from GitHub Actions), so you do **not** store a publish-capable **`NPM_TOKEN`** for this workflow.

### One-time: trusted publisher on npm

1. On [npmjs.com](https://www.npmjs.com/), open **`@usebrindle/merge-risk-core`** → **Settings** (or **Package access**) → **Trusted publisher** (wording may vary).
2. Choose **GitHub Actions** and configure:
   - **Repository:** `usebrindle/brindle` (must match the repo that runs the workflow).
   - **Workflow filename:** `publish-merge-risk-core.yml` only (not a path). Extension and spelling must match [`.github/workflows/publish-merge-risk-core.yml`](.github/workflows/publish-merge-risk-core.yml) exactly — npm does not validate until publish time.

See npm’s doc for [GitHub Actions configuration](https://docs.npmjs.com/trusted-publishers#github-actions-configuration) (`id-token: write`, supported runners, and `repository.url` alignment). After publishes succeed via OIDC, consider restricting token-based publishing on the package (npm: **Publishing access** → require 2FA and disallow tokens) and revoking old automation tokens.

### Each release

1. On **`main`**, bump **`version`** in [`packages/merge-risk-core/package.json`](packages/merge-risk-core/package.json) (via a normal PR).
2. Create and push an annotated tag **`merge-risk-core-v{version}`** whose suffix matches `package.json` (example: `merge-risk-core-v0.2.0`). From repo root you can run **`npm run tag:merge-risk-core`** (see [`scripts/tag-merge-risk-core.mjs`](scripts/tag-merge-risk-core.mjs); use `--dry-run` to preview). That triggers [`.github/workflows/publish-merge-risk-core.yml`](.github/workflows/publish-merge-risk-core.yml), which runs **`npm publish -w @usebrindle/merge-risk-core`**.

Before tagging, validate the tarball locally: **`npm run build -w @usebrindle/merge-risk-core`** then **`npm pack -w @usebrindle/merge-risk-core`**.

## Pull requests
