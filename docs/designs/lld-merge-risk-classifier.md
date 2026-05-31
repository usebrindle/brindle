# Low-Level Design v4 ... PR Merge Risk Classifier

A platform-agnostic risk classifier for pull and merge requests. It scores every change against a configurable set of weighted criteria, reports a risk tier back to the platform, and optionally enables the platform's native auto-merge on the safest tier. The scoring engine is deterministic, auditable, and team-defined. No generative AI, no LLM calls, zero token cost per run.

This is the execution spec.

---

## Changes from v3

1. **Platform adapter boundary introduced.** The core no longer assumes GitHub. All platform-specific behavior lives behind one `PlatformAdapter` interface. The scoring engine, criteria, mutators, config, and coverage adapters are platform-agnostic. See ADR 0007.
2. **Vocabulary made neutral.** The code uses "change request" internally where GitHub says pull request and GitLab says merge request. Platform terms appear only inside adapters.
3. **Packaging clarified.** One platform-agnostic core artifact, wrapped by a native CI extension per platform. GitHub first, GitLab second, Bitbucket third. See ADR 0008.

---

## Architecture in One Paragraph

A change request event triggers the CI extension. A platform adapter builds a fully hydrated, immutable context from base-branch config and change-request data. The pure scoring engine runs a set of criteria over that context, applies multiplicative mutators, and maps the result to LOW, MEDIUM, or HIGH. The adapter writes the result back as a comment and a status or check. If the tier is at or below the configured auto-merge tier, the adapter enables the platform's native auto-merge and steps away. The platform enforces everything from there.

The core is the judgment layer. The platform is the enforcement layer. The adapter is the only thing that knows which platform it is talking to.

---

## Layering

```
                  CI extension wrappers (per platform)
        GitHub Action  |  GitLab CI component  |  Bitbucket Pipe
                              |
                       PlatformAdapter
              GitHubAdapter | GitLabAdapter | BitbucketAdapter
                              |
        ┌─────────────────────┴─────────────────────┐
        │              PLATFORM-AGNOSTIC CORE        │
        │  context types | scorer | criteria |       │
        │  mutators | coverage adapters | config |   │
        │  rules | trusted plugins | reporting model │
        └────────────────────────────────────────────┘
```

Everything below the adapter line is written once and never changes across platforms. Everything at or above the line is platform-specific and thin.

---

## Repository Structure

```
merge-risk-classifier/
├── package.json
├── tsconfig.json
├── core/                          # platform-agnostic, publishable later
│   ├── scorer.ts
│   ├── types.ts                   # PRContext, ScoreResult, MergeMethod, etc.
│   ├── criteria/
│   │   ├── registry.ts
│   │   ├── diffSize.ts
│   │   ├── filePatterns.ts
│   │   ├── testCoverage.ts
│   │   ├── authorSeniority.ts
│   │   ├── serviceCriticality.ts
│   │   └── branchAge.ts
│   ├── coverage/
│   │   ├── adapter.ts
│   │   ├── istanbul.ts
│   │   ├── lcov.ts
│   │   └── cobertura.ts
│   ├── mutators/
│   │   ├── registry.ts
│   │   ├── juniorAuthor.ts
│   │   └── criticalService.ts
│   ├── rules/
│   │   └── declarativeRule.ts
│   ├── plugins/
│   │   └── loadTrustedPlugins.ts
│   ├── config.ts
│   └── report.ts                  # builds platform-neutral RiskReport
├── adapters/
│   ├── PlatformAdapter.ts         # the interface
│   ├── github/
│   │   ├── GitHubAdapter.ts
│   │   └── client.ts
│   ├── gitlab/                    # v2 of the project
│   └── bitbucket/                 # v3 of the project
├── extensions/
│   ├── github-action/
│   │   ├── action.yml
│   │   ├── index.ts               # entry point, wires GitHubAdapter + core
│   │   └── dist/                  # ncc bundle, committed
│   ├── gitlab-component/          # later
│   └── bitbucket-pipe/            # later
├── schema/
│   └── config.schema.json
├── docs/
│   ├── design/
│   └── adr/
└── test/
```

---

## The Platform Adapter Boundary

The single interface that isolates all platform-specific behavior.

```ts
// adapters/PlatformAdapter.ts

export interface PlatformAdapter {
  // Fetch change-request data, changed files, and base-branch config.
  // Returns the immutable context the core scores against.
  buildContext(): Promise<PRContext>;

  // Render the result as a comment and a status or check on the platform.
  writeResult(report: RiskReport): Promise<void>;

  // Enable the platform's native auto-merge. Returns the outcome.
  // Adapters whose platform has no native auto-merge return "unsupported".
  enableAutoMerge(method: MergeMethod): Promise<AutoMergeOutcome>;
}

export type MergeMethod = "squash" | "merge" | "rebase";

export type AutoMergeOutcome =
  | "skipped"        // disabled in config
  | "not_eligible"   // tier riskier than configured
  | "enabled"        // native auto-merge turned on
  | "unsupported"    // platform has no native auto-merge
  | "setting_off";   // platform setting disallows it
```

`PRContext`, `ScoreResult`, and `RiskReport` are defined in `core/types.ts` and contain no platform-specific fields. The adapter translates platform responses into these neutral shapes on the way in, and translates the neutral `RiskReport` into platform calls on the way out.

---

## Security Model

Unchanged in principle from v3, now stated platform-neutrally. The core rule. The system never executes, evaluates, or interprets anything that originated from the change-request head. Config, declarative rules, and trusted plugins all load from the base branch via the adapter, which a fork cannot modify. The auto-merge decision is computed from base-branch config and deterministic scoring. Because adapters enable the platform's native auto-merge rather than calling a merge endpoint, branch protection, required checks, and required approvals always still apply. See ADR 0001 and ADR 0002.

---

## Core Types

```ts
// core/types.ts

export interface Criterion {
  name: string;
  evaluate(context: PRContext, options: unknown): CriterionResult;  // pure
}

export interface CriterionResult {
  score: number;          // 0-100, higher is riskier
  justification: string;
  detail?: Record<string, unknown>;
}

export interface PRContext {
  // Platform-neutral. Adapters populate this from their own APIs.
  repoSlug: string;
  changeNumber: number;
  headSha: string;
  baseRef: string;
  author: string;
  title: string;
  body: string;
  labels: string[];
  createdAt: string;
  files: ChangedFile[];
  totalAdditions: number;
  totalDeletions: number;
  coverage?: CoverageReport;
  baselineCoverage?: CoverageReport;
}

export interface ScoreResult {
  score: number;
  tier: "LOW" | "MEDIUM" | "HIGH";
  breakdown: CriterionBreakdown[];
  mutatorsApplied: string[];
  disabledCriteria: string[];
}

export interface RiskReport {
  // Platform-neutral reporting payload the adapter renders natively.
  result: ScoreResult;
  commentMarkdown: string;
  checkConclusion: "success" | "neutral" | "action_required" | "failure";
  autoMergeOutcome: AutoMergeOutcome;
}
```

The scoring engine and every criterion depend only on `core/types.ts`. They import nothing from `adapters/`.

---

## Scoring Engine (core/scorer.ts)

Fully deterministic and pure. Identical across all platforms.

```ts
export function score(context: PRContext, config: Config): ScoreResult;
```

1. Collect all enabled scorers. Built-in criteria plus declarative rules plus resolved trusted plugins, sharing one interface and one weight pool.
2. Drop any criterion that self-disables. Renormalize remaining weights to sum to 100.
3. For each, `weighted = rawScore * (weight / 100)`. Sum to a base score from 0 to 100.
4. Apply enabled mutators whose condition matches. Each multiplies the running score. Multiplication is commutative, so order does not matter. Cap at 100.
5. Map to a tier using `thresholds`.

Built-in criteria, the coverage adapter, mutators, declarative rules, and the config schema are exactly as specified in v3. They are unchanged because they were already platform-agnostic. Their only adjustment is that they read the neutral `PRContext` fields rather than any GitHub-shaped object.

---

## Reporting Flow

`core/report.ts` builds a platform-neutral `RiskReport` from a `ScoreResult`. It produces the comment markdown, selects the check conclusion from the tier and the `fail-on-high` setting, and records the auto-merge outcome. The adapter then renders this report using whatever the platform offers.

On GitHub the adapter writes a Check Run and an optional PR comment. On GitLab the adapter writes a merge request note and a pipeline status or external status check. On Bitbucket the adapter writes a report through the Code Insights API and a PR comment. The neutral `RiskReport` is identical in all three cases. Only the rendering differs.

---

## Auto-Merge Across Platforms

The decision logic lives in the core and is identical everywhere. If disabled, skip. If the tier is riskier than configured, not eligible. Otherwise instruct the adapter to enable native auto-merge.

The enabling differs by platform and is the adapter's job.

GitHub. Call the `enablePullRequestAutoMerge` mutation. Native auto-merge waits for required checks and approvals.

GitLab. Set merge-when-pipeline-succeeds on the merge request. Close in spirit to GitHub's behavior.

Bitbucket. No clean native equivalent. The Bitbucket adapter returns `unsupported` for auto-merge. Bitbucket gets scoring and reporting only, which is known and documented rather than discovered later. See ADR 0007.

---

## GitHub Action Extension (extensions/github-action)

The first shipping wrapper. Thin. It constructs a `GitHubAdapter`, calls `buildContext`, runs `score`, builds the `RiskReport` via `core/report.ts`, calls `writeResult`, then `enableAutoMerge` when eligible, and sets Action outputs.

```yaml
# extensions/github-action/action.yml
name: "Merge Risk Classifier"
description: "Scores change requests against configurable weighted criteria and assigns a risk tier."
author: "Buddy Shed"

inputs:
  config-path:
    description: "Path to .merge-risk.yml relative to repo root"
    required: false
    default: ".merge-risk.yml"
  github-token:
    description: "Token for API access, comments, checks, and auto-merge"
    required: true
    default: ${{ github.token }}
  post-comment:
    description: "Post a risk summary comment to the change request"
    required: false
    default: "true"
  fail-on-high:
    description: "Set the check conclusion to failure when tier is HIGH"
    required: false
    default: "false"

outputs:
  risk-tier:
    description: "LOW | MEDIUM | HIGH"
  risk-score:
    description: "Numeric score 0-100"
  criteria-breakdown:
    description: "JSON string of per-criterion scores"
  auto-merge-outcome:
    description: "skipped | not_eligible | enabled | unsupported | setting_off"

runs:
  using: "node20"
  main: "dist/index.js"
```

Consumer workflow, same-repo default.

```yaml
name: Merge Risk Check
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  risk-check:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      checks: write
      contents: write        # only when auto_merge is enabled
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.base_ref }}
      - uses: buddyshed/merge-risk-classifier@v1
        with:
          fail-on-high: false
```

---

## Config Schema

Identical to v3 and platform-neutral already. Read from the base branch by the adapter. The full schema with criteria, mutators, services, declarative rules, trusted plugins, and the auto-merge block is unchanged. The only neutral note is that `services` paths and file globs are repository-relative and mean the same thing on every platform.

---

## Dependencies

```json
{
  "dependencies": {
    "ajv": "^8.12.0",
    "js-yaml": "^4.1.0",
    "micromatch": "^4.0.5"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@vercel/ncc": "^0.38.0",
    "vitest": "^1.0.0",
    "@types/node": "^20.0.0",
    "@types/js-yaml": "^4.0.0",
    "@types/micromatch": "^4.0.0"
  }
}
```

The core has no platform SDK dependency at all. Platform SDKs such as `@actions/core`, `@actions/github`, and `@octokit/action` are dependencies of the GitHub extension only, not the core. This keeps the core publishable and portable.

---

## Build and Distribution

The core compiles to a portable module. Each extension bundles the core plus its adapter into one artifact in the platform's native format.

```json
{
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "build:core": "tsc -p core",
    "build:github": "ncc build extensions/github-action/index.ts -o extensions/github-action/dist --source-map",
    "build": "npm run build:core && npm run build:github"
  }
}
```

The GitHub extension commits its `dist/`. A CI job rebuilds and fails if the committed bundle drifts from source.

---

## Testing Strategy

- Pure unit tests on the scorer with fixture contexts. Weight normalization, redistribution on self-disable, mutator commutativity, capping, tier mapping. No platform involved.
- One unit test per built-in criterion against mock neutral contexts.
- Coverage adapter tests per format plus an `auto` dispatch test.
- Config tests for valid config, defaults, and clear errors.
- Adapter tests with a stubbed platform client, verifying `buildContext` produces a correct neutral `PRContext` and `writeResult` makes the right platform calls for each conclusion.
- Security tests for the plugin loader. Refuses paths outside the plugin directory, never reads the change-request head.
- One integration test per shipping extension against a fixture event payload, exercising the adapter and the real scorer end to end.

---

## Build Order for Today

1. Repo scaffold with the `core`, `adapters`, and `extensions` layout. `tsconfig`, `package.json`.
2. `core/types.ts`, then `core/scorer.ts` with pure unit tests. The heart, and it needs no platform access.
3. Built-in criteria, one at a time, each with tests.
4. Coverage adapter with the Istanbul parser. Defer lcov and Cobertura.
5. `core/config.ts` with schema validation.
6. `core/report.ts` building the neutral report.
7. `adapters/PlatformAdapter.ts` interface, then `adapters/github/` implementation.
8. `extensions/github-action/` wrapper. Wire adapter plus core.
9. ncc build, commit `dist/`, dogfood on this repo's own change requests with `auto_merge.enabled: false`.

---

## Deferred to Later Versions

- GitLab CI component and adapter. v2 of the project.
- Bitbucket Pipe and adapter, scoring and reporting only since auto-merge is unsupported there. v3 of the project.
- Hosted dashboard, cross-repo and cross-platform analytics, auto-merge-rate history, centralized config, audit export. The paid tier. See ADR 0008.
- Publishing the core engine to npm as a standalone library. Option held open by the layering, not committed.
- lcov and Cobertura coverage parsers. Interface ready, parsers after the core ships.
