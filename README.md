<div align="center">

<img src="docs/assets/brindle-mark.png" alt="Brindle" width="160" />

# Brindle

**Know which pull requests are safe to merge without a human.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node.js-%3E%3D20-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![CI](https://github.com/usebrindle/brindle/actions/workflows/ci.yml/badge.svg)](https://github.com/usebrindle/brindle/actions/workflows/ci.yml)

</div>

Brindle gives every pull request a **risk score from 0 to 100**, then sorts it into a tier ... LOW, MEDIUM, or HIGH. Low-risk changes can merge on their own. Risky ones get held for a human. You decide what counts as risky.

> **0.1.0 ... early but real.** The scoring engine, the GitHub Action, the PR check and comment, and native auto-merge all work today. Four built-in criteria ship in this release (`diff_size`, `file_patterns`, `author_seniority`, and `test_coverage`). The config format may still change before `1.0`, so pin to a version. Brindle supports same-repo pull requests.

## Table of contents

- [The problem](#the-problem)
- [What Brindle does](#what-brindle-does)
- [The 60-second mental model](#the-60-second-mental-model)
- [Setup in 3 steps](#setup-in-3-steps)
  - [Step 1 ... create the config file](#step-1-create-the-config-file)
  - [Step 2 ... create the workflow file](#step-2-create-the-workflow-file)
  - [Step 3 ... open a pull request](#step-3-open-a-pull-request)
- [Add auto-merge so LOW-risk PRs merge themselves (optional)](#add-auto-merge-so-low-risk-prs-merge-themselves-optional)
- [Add coverage scoring (optional)](#add-coverage-scoring-optional)
- [Add file-pattern scoring (optional)](#add-file-pattern-scoring-optional)
- [Add author seniority scoring (optional)](#add-author-seniority-scoring-optional)
- [Declarative rules (optional)](#declarative-rules-optional)
- [Trusted plugins (optional)](#trusted-plugins-optional)
- [What you get on every PR](#what-you-get-on-every-pr)
- [Full input reference](#full-input-reference)
- [Criteria reference](#criteria-reference)
- [Mutators reference](#mutators-reference)
- [Declarative rules reference](#declarative-rules-reference)
- [Trusted plugins reference](#trusted-plugins-reference)
- [Roadmap](#roadmap)
- [npm package (programmatic use)](#npm-package-programmatic-use)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## The problem

AI made writing code fast. It did not make reviewing it fast. Once a team adopts AI coding tools, the number of pull requests climbs, and human review turns into the bottleneck. Most of those changes are small and safe ... a copy tweak, a config bump, a well-tested refactor. A few are genuinely risky. Reviewing all of them with the same scrutiny wastes your reviewers on the safe ones and leaves less attention for the dangerous ones.

The hard part is telling them apart, consistently, on every single PR, without a human having to eyeball each one to decide.

## What Brindle does

Brindle reads each pull request the moment it opens and gives it a single risk score from 0 to 100, then sorts it into a tier ... LOW, MEDIUM, or HIGH. You define what "risky" means for your codebase, and Brindle applies that definition the same way every time.

- **LOW** changes are safe enough to merge on their own, so they can skip the review queue entirely.
- **MEDIUM** and **HIGH** changes get held for a human, so your reviewers spend their attention where it actually matters.

It runs as a GitHub Action inside your own CI, posts its verdict as a check and a comment on the PR, and can optionally enable GitHub's native auto-merge for the changes it considers safe. What makes it trustworthy is that the scoring is **deterministic** ... no AI, no guessing, no token cost. The same change always gets the same score, and you can read every rule that produced it.

- **Deterministic.** No generative AI, no LLM calls, zero cost per run. Every rule is one you can audit.
- **Runs in your own CI.** Brindle is a GitHub Action, not a hosted service. Your code never leaves your pipeline.
- **You own the rules.** You set the criteria, the weights, and the thresholds in one small YAML file.
- **Auto-merge, safely.** Brindle only ever enables GitHub's own auto-merge. Your branch protection, required checks, and approvals still apply. Brindle decides what is safe. GitHub enforces the rules.

Brindle is the judgment layer. GitHub is the enforcement layer.

## The 60-second mental model

Here is the whole idea. The config makes sense once you have this.

A **criterion** is one check Brindle runs against a pull request. Each criterion you enable looks at the PR and produces its own **raw score from 0 to 100**, where higher means riskier. For example, the `diff_size` criterion scores a tiny one-line PR near 0 and a huge PR near 100.

When you enable more than one criterion, a **weight** decides how much each one counts toward the final number. Weight is a *ratio*, not an absolute value. A criterion with weight 60 sitting next to one with weight 40 contributes 60 percent of the score versus 40 percent. Weights of 6 and 4 would produce the exact same split, because only the proportion between them matters. (And if you enable just one criterion, its weight is irrelevant ... it is always 100 percent of the score no matter what number you write.)

Brindle blends the weighted scores into **one final score from 0 to 100** for the whole PR.

**Thresholds** are the two cutoff lines you set that turn that final score into a tier. At or below the `low` line is LOW. At or below the `medium` line is MEDIUM. Above it is HIGH.

That is the entire system. Criteria score, weights set the proportions, thresholds sort the result into a tier. Everything below just spells out each knob.

---

## Setup in 3 steps

About five minutes. Two files, one optional setting.

### Step 1 ... create the config file

Create **`.merge-risk.yml`** in the root of your default branch (usually `main`). Paste this. It works exactly as written, and every line is explained right after.

```yaml
# .merge-risk.yml
thresholds:
  low: 30
  medium: 60

criteria:
  diff_size:
    weight: 100          # arbitrary while diff_size is the only criterion (see "weight" below)
    options:
      max_lines_for_cap: 200
```

#### What every line actually means

**`thresholds`** ... the two cutoff lines that turn the final 0-to-100 score into a tier. With the values above:

| Final score | Tier | What it means |
|---|---|---|
| 0 to 30 | **LOW** | At or below the `low` line. Safe. Eligible for auto-merge. |
| 31 to 60 | **MEDIUM** | Above `low`, at or below `medium`. Review recommended. |
| 61 to 100 | **HIGH** | Above the `medium` line. A human should review before merging. |

So `low: 30` means "any PR scoring 30 or under is low risk." `medium: 60` means "anything over 60 is high risk." Move these numbers to make Brindle stricter or more relaxed. Lower thresholds means more PRs get flagged. Higher means more sail through.

**`criteria`** ... the list of things Brindle checks on each PR. You turn criteria on by listing them here. In this starter config there is just one, `diff_size`. Each criterion you list needs a `weight`, and some accept `options`.

**`weight`** ... how much this criterion counts *relative to the other criteria you have enabled*. Weight is a share, not an absolute number. Brindle adds up the weights of every enabled criterion and gives each one its proportional slice of the final score.

- A criterion's share is `its weight / sum of all enabled weights`. Weights of 60 and 40 produce a 60/40 split. Weights of 6 and 4 produce the *same* 60/40 split. Only the ratio matters, so there is no special meaning to any particular number and no upper limit you need to respect.
- Two criteria at equal weight each drive half the score. Three at equal weight each drive a third.
- **With only one criterion enabled, weight does nothing.** A lone criterion is always 100 percent of the score whether you write `weight: 100`, `weight: 1`, or `weight: 9999999`. In the starter config above, the `100` is just a placeholder. Weight only starts to matter the moment you add a second criterion.

This is deliberate. You can add or remove a criterion without rebalancing everyone else's numbers to keep them summing to 100. Brindle normalizes for you.

**`options`** ... per-criterion settings. Each criterion defines its own. For `diff_size` there is one:

**`max_lines_for_cap`** ... the number of changed lines at which `diff_size` scores the maximum 100. "Changed lines" means additions plus deletions. The score scales linearly up to this cap.

- With `max_lines_for_cap: 200`, a PR that changes 200 or more lines scores 100 on this criterion. A 100-line PR scores 50. A 20-line PR scores 10. The formula is `(lines changed / cap) * 100`, capped at 100.
- Lower the cap to treat smaller PRs as risky sooner. Raise it if your team ships big diffs routinely and you do not want size alone to dominate.
- If you leave `max_lines_for_cap` out entirely, the default cap is 400.

### Step 2 ... create the workflow file

Create **`.github/workflows/merge-risk.yml`**. Copy this exactly.

```yaml
name: Merge risk
on:
  pull_request:

jobs:
  brindle:
    runs-on: ubuntu-latest
    permissions:
      checks: write          # lets Brindle publish the risk Check Run
      pull-requests: write   # lets Brindle post the risk comment
    steps:
      - uses: actions/checkout@v4
      - uses: usebrindle/brindle/extensions/github-action@v0.1.0
        with:
          # IMPORTANT for your very first PR. Brindle reads .merge-risk.yml from the
          # BASE branch (the branch you are merging into), never from the PR itself.
          # But the PR that adds these two files is introducing the config for the
          # first time, so it is not on the base branch yet. This flag tells Brindle
          # "if the config is not on the base branch, pass quietly instead of failing."
          # Delete this line after this first PR merges.
          skip_when_merge_risk_missing_on_base: "true"
```

**Why `permissions` matters** ... GitHub Actions start with no permissions. Brindle needs `checks: write` to post the pass/fail check and `pull-requests: write` to leave the comment. Without these the Action runs but cannot show you anything.

### Step 3 ... open a pull request

Open any PR against your default branch. Within a few seconds Brindle posts a check and a comment showing the tier, the score, and a breakdown of how each criterion contributed.

**That is the whole setup.** After this first PR merges, `.merge-risk.yml` is on your base branch, so delete the `skip_when_merge_risk_missing_on_base` line. Every PR after that is scored automatically.

---

## Add auto-merge so LOW-risk PRs merge themselves (optional)

**1. Turn on auto-merge in your repo.** Go to **Settings -> General**, scroll to **Pull Requests**, and check **Allow auto-merge**. This is a GitHub feature Brindle switches on for you, so the repo has to allow it first. If this box is unchecked, Brindle's auto-merge silently does nothing.

**2. Add an `auto_merge` block to `.merge-risk.yml`:**

```yaml
auto_merge:
  enabled: true
  tier: low        # the riskiest tier allowed to auto-merge. "low" = only LOW-risk PRs.
  method: squash   # how to merge: squash | merge | rebase
```

- **`enabled`** ... master switch for the feature.
- **`tier`** ... the highest-risk tier Brindle will auto-merge. `low` means only LOW PRs merge themselves. Set it to `medium` and both LOW and MEDIUM auto-merge, which is more aggressive.
- **`method`** ... which merge button Brindle presses. `squash` combines all commits into one, `merge` keeps them with a merge commit, `rebase` replays them.

**3. Let the workflow merge.** Add `contents: write` to `permissions`:

```yaml
    permissions:
      contents: write        # needed so Brindle can enable auto-merge on the PR
      checks: write
      pull-requests: write
```

When a PR comes in at or below your `tier`, Brindle turns on GitHub's native auto-merge. GitHub still waits for your required status checks and approvals before it actually merges, so your branch protection is never bypassed. **Brindle decides. GitHub enforces.**

---

## Add coverage scoring (optional)

If your CI already produces an Istanbul `coverage-final.json`, Brindle can factor test coverage into the score.

**1. Add the `test_coverage` criterion** alongside `diff_size`, and give them weights that reflect how much each should count:

```yaml
criteria:
  diff_size:
    weight: 60
    options:
      max_lines_for_cap: 200
  test_coverage:
    weight: 40
    options:
      minimum_percent: 80   # coverage below this scores riskier
```

With weights 60 and 40, diff size drives 60 percent of the score and coverage 40 percent.

**`minimum_percent`** ... the coverage level you consider healthy. Coverage at or above this scores low risk on this criterion. The further below it falls, the higher the risk score.

**2. Make sure your tests run with coverage before the Brindle step**, then point Brindle at the file:

```yaml
      - uses: usebrindle/brindle/extensions/github-action@v0.1.0
        with:
          coverage_report_path: coverage/coverage-final.json
```

If the file is not found, `test_coverage` quietly disables itself and its weight is redistributed to your other criteria. Nothing breaks.

---

## Add file-pattern scoring (optional)

The **`file_patterns`** criterion raises the risk score when any **changed file path** on the pull request matches a glob you configure. Globs use [micromatch](https://github.com/micromatch/micromatch) syntax. Paths come from the platform adapter (on GitHub, repository-relative paths as returned by the pull request files API, forward slashes).

**1. Add `file_patterns` under `criteria`** with a `weight` and an `options` block (or omit `options` / use `options: {}` to match nothing until you add rules):

```yaml
criteria:
  diff_size:
    weight: 60
    options:
      max_lines_for_cap: 200
  file_patterns:
    weight: 40
    options:
      aggregation: max   # optional; only `max` is supported today
      patterns:
        - glob: "**/migrations/**"
          score: 80
        - glob: "src/auth/**"
          score: 50
```

**`patterns`** ... a list of rules. Each rule has **`glob`** (string, non-empty) and **`score`** (number from 0 to 100). If **any** changed file matches the glob, that rule’s score is a candidate. Brindle uses the **maximum** score among all matching rules for this criterion’s raw 0–100 output (so overlapping globs do not stack additively).

**`aggregation`** ... reserved for future combination modes. Only **`max`** is allowed when present; you can omit it.

If no patterns are configured, or nothing matches, this criterion scores **0** (low risk) for that run.

---

## Add author seniority scoring (optional)

The **`author_seniority`** criterion scores pull requests using the **author login** on the change request. It does not call external directory APIs: you define tiers in base-branch config by listing logins and scores. Matching uses the same login string the platform adapter puts on [`PRContext.author`](core/types.ts) (on GitHub, the pull request author login), compared **case-insensitively** after trimming whitespace.

**1. Add `author_seniority` under `criteria`** with a `weight` and an `options` block (or omit `options` / use `options: {}` until you add rules):

```yaml
criteria:
  diff_size:
    weight: 60
    options:
      max_lines_for_cap: 200
  author_seniority:
    weight: 40
    options:
      aggregation: max   # optional; only `max` is supported today
      default_score: 55  # optional; used when the author matches no rule (0–100)
      rules:
        - login: "senior-dev"
          score: 5
        - login: "bot-account"
          score: 80
```

**`rules`** ... a list of `{ login, score }`. Each **`login`** is a non-empty string; each **`score`** is from 0 to 100. If the PR author matches one or more rules, Brindle uses the **maximum** `score` among those rules for this criterion’s raw output (duplicate logins for the same person do not stack additively).

**`default_score`** ... optional number from 0 to 100. When **at least one** rule is configured but the author matches **none** of them, that value becomes the raw score. If you omit it, the runtime treats unknown authors as **0** for this criterion until you set a default.

**`aggregation`** ... reserved for future combination modes. Only **`max`** is allowed when present; you can omit it.

If **no** `rules` are configured, this criterion scores **0** (same as an empty rule list at runtime).

---

## Add junior author mutator (optional)

The **`junior_author`** mutator **multiplies** the weighted score after all criteria run when the change-request **author login** matches one of the configured **`logins`**. It uses the same neutral [`PRContext.author`](core/types.ts) string as `author_seniority`, compared **case-insensitively** after trimming. Use it for a small multiplicative bump on top of weighted criteria (for example interns or bots), not as a substitute for seniority scoring.

**1. Add `junior_author` under `mutators`** with a required **`options`** block:

```yaml
criteria:
  diff_size:
    weight: 100
mutators:
  junior_author:
    options:
      logins:
        - "intern-bot"
        - "dependabot"
      multiplier: 1.15   # must be strictly greater than 1
```

**`logins`** ... non-empty array of non-empty strings.

**`multiplier`** ... a finite number **strictly greater than 1**. Values at or below 1 are rejected by config validation.

You may set **`enabled: false`** on the mutator entry to keep the block in config while turning it off; **`options` is still required** when `junior_author` is present so the shape stays explicit.

---

## Add critical service mutator (optional)

The **`critical_service`** mutator **multiplies** the weighted score after criteria when the change touches at least one logical service listed under **`service_ids`**, using the same **root `services`** catalog and micromatch rules as **`service_criticality`** ([ADR 0009](docs/adrs/0009-service-criticality-criterion-config.md)). The scorer merges **`services`** into mutator options at apply time (you do not embed the catalog under `mutators.critical_service.options`).

**1.** Declare root **`services`** (if you have not already). **2.** Add **`critical_service`** under **`mutators`** with required **`options`**:

```yaml
services:
  payments:
    globs:
      - "src/payments/**"
criteria:
  diff_size:
    weight: 100
mutators:
  critical_service:
    options:
      service_ids:
        - "payments"
      multiplier: 1.25   # must be strictly greater than 1
```

**`service_ids`** ... non-empty array of non-empty strings; each id should match a key under root **`services`**.

**`multiplier`** ... strictly greater than 1 (same rule as `junior_author`).

With **`enabled: false`**, **`options` is still required** when `critical_service` is present.

---

## Declarative rules (optional)

**`declarative_rules`** is an optional top-level map. Each key is a **rule id** (your choice, stable string). Each entry has the same shape as a built-in criterion: **`weight`**, optional **`enabled`**, and **`options`**. Declarative rules share the same weight pool as **`criteria`** and appear in the breakdown with display names of the form **`Declarative rule: your_rule_id`** (using your YAML key).

MVP interpreter: **`labels_any`** (list of non-empty strings) and **`score`** (0–100). If **any** label on the change request matches one of the strings (**case-insensitive**, after trimming), the rule’s raw score is **`score`**; otherwise the raw score is 0. Config is read from the **base branch** only ([ADR 0001](docs/adrs/0001-no-pr-head-execution.md)).

```yaml
criteria:
  diff_size:
    weight: 90
    options:
      max_lines_for_cap: 400
declarative_rules:
  hot_labels:
    weight: 10
    options:
      labels_any:
        - database
        - security
      score: 70
```

---

## Trusted plugins (optional)

**`trusted_plugins`** is an optional top-level block that lists **repository-relative paths** to small YAML **plugin definition files** on the **base branch** only ([ADR 0001](docs/adrs/0001-no-pr-head-execution.md)). The Action fetches each file via the GitHub Contents API at the PR base ref, then merges the resulting criteria into the same weight pool as **`criteria`** and **`declarative_rules`**. Breakdown rows use names of the form **`Trusted plugin: path/to/file.yaml`**.

- **`directory`** ... non-empty string; every path under **`paths`** must resolve **strictly inside** this directory (path guardrails reject `..` escapes and absolute paths).
- **`paths`** ... list of non-empty strings; each path must stay under **`directory`**.

MVP plugin file shape (each file is its own document):

- **`kind`**: must be **`labels_any`** today.
- **`weight`**: finite number **> 0** (this criterion’s share of the pool; same idea as `criteria.*.weight`).
- **`labels_any`** / **`score`**: same MVP semantics as declarative **`options`** (`labels_any` list, `score` 0–100).

```yaml
criteria:
  diff_size:
    weight: 90
    options:
      max_lines_for_cap: 400
trusted_plugins:
  directory: ".merge-risk-plugins"
  paths:
    - ".merge-risk-plugins/risk-labels.yaml"
```

Example **`.merge-risk-plugins/risk-labels.yaml`**:

```yaml
kind: labels_any
weight: 10
labels_any:
  - production
score: 75
```

---

## What you get on every PR

A check run and a comment. The comment leads with the verdict ... tier, score, and one plain sentence on what to do ... followed by a collapsible breakdown of every criterion's contribution, so anyone can see exactly why a change scored the way it did. The check conclusion follows the tier, so a HIGH PR can block merge under branch protection when you want it to.

Because the scoring is deterministic, the same change always gets the same score. No generative AI, no LLM calls, zero token cost, and every rule is one you can read.

---

## Full input reference

| Input | Default | What it does |
|---|---|---|
| `github_token` | `${{ github.token }}` | Token used to read config from the base ref, publish the check, and post the comment. |
| `merge_risk_file_path` | `.merge-risk.yml` | Path to your config file, always read from the PR base branch. |
| `skip_when_merge_risk_missing_on_base` | `false` | When `true`, passes quietly if the config is not yet on the base branch. Use it on the first PR, then remove it. |
| `coverage_report_path` | `` (empty) | Path to an Istanbul `coverage-final.json` on the PR head. Leave empty to skip coverage entirely. |

## Criteria reference

| Criterion | Options | What it measures |
|---|---|---|
| `diff_size` | `max_lines_for_cap` (default 400) | Total added + deleted lines. Score is `(lines / cap) * 100`, capped at 100. |
| `file_patterns` | `patterns` (list of `glob` + `score`), optional `aggregation: max` | Whether changed paths match sensitive globs; raw score is the max `score` among matching rules. |
| `author_seniority` | `rules` (list of `login` + `score`), optional `default_score`, optional `aggregation: max` | Maps the change-request author login to a raw score; unknown authors use `default_score` when rules exist. |
| `test_coverage` | `minimum_percent` | Test coverage from an Istanbul report versus your minimum. Self-disables when no report is provided. |

## Mutators reference

| Mutator | Options | What it does |
|---|---|---|
| `junior_author` | `logins` (non-empty list of non-empty strings), `multiplier` (number &gt; 1) | Multiplies the running score when `PRContext.author` matches any listed login (case-insensitive). |
| `critical_service` | `service_ids` (non-empty list of non-empty strings), `multiplier` (number &gt; 1) | Multiplies when any changed path matches root **`services`** globs for a listed service id. |

## Declarative rules reference

| Field | Options | What it does |
|---|---|---|
| Each key under **`declarative_rules`** | `weight`, optional `enabled`, optional `options` | Extra weighted signals interpreted by the engine (same pool as **`criteria`**). |
| (MVP) `options` | `labels_any` (list of non-empty strings), `score` (0–100) | Raw score is **`score`** when any PR label matches any entry in **`labels_any`** (case-insensitive); otherwise 0. |

## Trusted plugins reference

| Field | Shape | What it does |
|---|---|---|
| **`trusted_plugins`** | `directory` (non-empty string), `paths` (list of non-empty strings) | Opt-in list of base-branch YAML plugin files; each path must lie strictly under **`directory`**. |
| Plugin file (MVP) | `kind: labels_any`, `weight` (> 0), optional `labels_any`, optional `score` (0–100) | One extra weighted criterion per file; fetched at scoring time from the base ref only. |

More criteria (service criticality, branch age) and additional mutators are documented in the [LLD](docs/designs/).

## Roadmap

- [x] Core scoring engine
- [x] GitHub Action ... score, comment, check run
- [x] Native auto-merge on low-risk changes
- [x] Istanbul coverage scoring
- [x] File pattern criterion (`file_patterns`)
- [x] Author seniority criterion (`author_seniority`)
- [ ] More criteria ... service criticality, branch age
- [x] Junior author mutator (`junior_author`) — schema-validated
- [x] Critical service mutator (`critical_service`) — schema-validated; dogfood in-repo under **`mutators.critical_service`**
- [x] Declarative rules (`declarative_rules`) — labels_any MVP; schema-validated; dogfood rule and label **`merge-risk-dogfood-declarative`** in this repo’s `.merge-risk.yml`
- [x] Trusted plugins (`trusted_plugins`) — base-ref YAML files, `labels_any` MVP; schema-validated; wired in the GitHub Action
- [ ] Coverage formats ... lcov and Cobertura
- [ ] GitLab CI component
- [ ] Bitbucket Pipe

## npm package (programmatic use)

The platform-agnostic scoring engine is published as **`@usebrindle/merge-risk-core`** on npm. It exposes `score`, config loading, `buildRiskReport`, and related types from `core/` ... without GitHub adapters or the Action. Install details and a minimal example live in [packages/merge-risk-core/README.md](packages/merge-risk-core/README.md).

**Releasing a version**

1. On `main`, bump **`version`** in [packages/merge-risk-core/package.json](packages/merge-risk-core/package.json) (via PR).
2. Create and push an annotated tag **`merge-risk-core-v{version}`** (must match the `package.json` version, e.g. `merge-risk-core-v0.1.0`). That pushes the [Publish merge-risk-core](.github/workflows/publish-merge-risk-core.yml) workflow, which runs `npm publish -w @usebrindle/merge-risk-core`.

The repository needs an **`NPM_TOKEN`** secret (automation token with publish rights for the scope).

## Documentation

- [Architecture Decision Records](docs/adrs/) ... the why behind the design
- [Low-level design](docs/designs/) ... the how

## Contributing

Brindle is MIT licensed and built in the open. Setup and local workflow live in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](./LICENSE) ... a project by Buddy Shed.
