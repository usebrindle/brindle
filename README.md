<div align="center">

<img src="docs/assets/brindle-mark.png" alt="Brindle" width="160" />

# Brindle

**Know which pull requests are safe to merge without a human.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node.js-%3E%3D22-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![CI](https://github.com/usebrindle/brindle/actions/workflows/ci.yml/badge.svg)](https://github.com/usebrindle/brindle/actions/workflows/ci.yml)

</div>

Scoring is fully deterministic: configurable rules in your CI, with **no generative AI**, **no LLM calls**, and **no per-run token cost**.

## The problem

AI made writing code fast. It did not make reviewing it fast. Once a team adopts AI coding tools, the number of pull requests climbs, and human review turns into the bottleneck. Most of those changes are small and safe ... a copy tweak, a config bump, a well-tested refactor. A few are genuinely risky. Reviewing all of them with the same scrutiny wastes your reviewers on the safe ones and leaves less attention for the dangerous ones.

The hard part is knowing which changes are which before they pile up in the review queue.

## What Brindle does

Brindle reads each pull request the moment it opens and gives it a single risk score from 0 to 100, then sorts it into a tier ... LOW, MEDIUM, or HIGH. You define what "risky" means for your codebase, and Brindle applies that definition the same way every time.

- **LOW** changes are safe enough to merge on their own, so they can skip the review queue entirely.
- **MEDIUM** and **HIGH** changes get held for a human, so your reviewers spend their attention where it actually matters.

It runs as a GitHub Action inside your own CI, posts its verdict as a check and a comment on the PR, and can optionally enable GitHub's native auto-merge for the changes it considers safe. The same change always gets the same score, and you can read every rule that produced it.

- **Deterministic.** No generative AI, no LLM calls, zero cost per run. Every rule is one you can audit.
- **Runs in your own CI.** Brindle is a GitHub Action, not a hosted service. Your code never leaves your pipeline.
- **You own the rules.** You set the criteria, the weights, and the thresholds in one small YAML file.
- **Auto-merge, safely.** Brindle only ever enables GitHub's own auto-merge. Your branch protection, required checks, and approvals still apply. Brindle decides what is safe. GitHub enforces the rules.

Brindle is the judgment layer. GitHub is the enforcement layer.

## The 60-second mental model

Each **criterion** you enable produces a **raw score from 0 to 100** (higher = riskier for that signal). **Weights** are ratios between enabled criteria only ... they set each criterion’s share of the blended score, not absolute points. **Thresholds** (`low`, `medium`) turn that final 0–100 number into LOW, MEDIUM, or HIGH.

For the full pipeline (active vs disabled criteria, self-disable, mutators, breakdown math), read [docs/concepts/scoring.md](docs/concepts/scoring.md).

---

## Setup in 3 steps

About five minutes. Two files, one optional setting.

### Step 1 ... create the config file

Create **`.merge-risk.yml`** in the root of your default branch (usually `main`). Paste this. It works exactly as written.

```yaml
# .merge-risk.yml
thresholds:
  low: 30
  medium: 60

criteria:
  diff_size:
    weight: 100          # arbitrary while diff_size is the only criterion (see docs/concepts/scoring.md)
    options:
      max_lines_for_cap: 200
```

**`thresholds`** turn the final 0–100 score into a tier. With the values above:

| Final score | Tier | What it means |
| --- | --- | --- |
| 0 to 30 | **LOW** | At or below `low`. Safe. Eligible for auto-merge when you enable it. |
| 31 to 60 | **MEDIUM** | Above `low`, at or below `medium`. Review recommended. |
| 61 to 100 | **HIGH** | Above `medium`. A human should review before merging. |

**`criteria`** lists what Brindle evaluates; each entry needs a **`weight`**. Weights are **ratios** between enabled criteria (a lone criterion is always 100% of the blend). **`max_lines_for_cap`** is the changed-line count (additions + deletions) at which `diff_size` hits raw score 100; the score scales linearly up to that cap. More detail: [docs/concepts/scoring.md](docs/concepts/scoring.md) and [docs/reference/criteria.md](docs/reference/criteria.md).

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
      contents: read         # to read the merge-risk config from the base branch
      checks: write          # lets Brindle publish the risk Check Run
      issues: write          # list/update PR conversation comments (GitHub Issues comments API)
      pull-requests: write   # PR-scoped operations alongside the comment flow
    steps:
      - uses: actions/checkout@v4
      - uses: usebrindle/brindle/extensions/github-action@action-v0.1.1
        with:
          # IMPORTANT for your very first PR. Brindle reads .merge-risk.yml from the
          # BASE branch (the branch you are merging into), never from the PR itself.
          # But the PR that adds these two files is introducing the config for the
          # first time, so it is not on the base branch yet. This flag tells Brindle
          # "if the config is not on the base branch, pass quietly instead of failing."
          # Delete this line after this first PR merges.
          skip_when_merge_risk_missing_on_base: "true"
```

#### Pinning the Action to a commit SHA (optional, recommended for production)

The example above uses a **version tag** on the Action ref (`@action-v0.1.1`). Tags are convenient but **can move** if the upstream project retags or repoints a release.

For **private repositories or stricter production** pipelines, pin the Action to an **immutable full commit SHA** instead:

```yaml
      - uses: usebrindle/brindle/extensions/github-action@abcdef0123456789abcdef0123456789abcdef01
```

Replace the hex string with a **40-character commit SHA** from this repository that contains the Action entrypoint you want. **Tradeoff:** a SHA is **fixed and auditable** (the same workflow always runs the same third-party code). A **tag** can be updated to point at a new commit, which is easier to adopt but means the job’s behavior (and the code that receives `GITHUB_TOKEN` permissions) can change without you editing your workflow.

**Why `permissions` matters** ... When you set `permissions` on a job, anything you omit defaults to **no access**. Brindle needs **`contents: read`** so `GITHUB_TOKEN` can load **`.merge-risk.yml` from the pull request base ref** via the GitHub API. It needs **`checks: write`** to publish the Check Run. PR conversation comments are created and updated through the **Issues** REST API, so the example includes **`issues: write`** to list and update Brindle’s summary comment in place; **`pull-requests: write`** covers other PR-scoped operations. Without these scopes the Action can fail when reading config, posting results, or updating an existing comment.

### Step 3 ... open a pull request

Open any PR against your default branch. Within a few seconds Brindle posts a check and a comment showing the tier, the score, and a breakdown of how each criterion contributed.

**That is the whole setup.** After this first PR merges, `.merge-risk.yml` is on your base branch, so delete the `skip_when_merge_risk_missing_on_base` line. Every PR after that is scored automatically.

## What you get on every PR

A check run and a comment. The comment leads with the verdict ... tier, score, and one plain sentence on what to do ... followed by a collapsible breakdown of every criterion's contribution, so anyone can see exactly why a change scored the way it did. The check conclusion follows the tier, so a HIGH PR can block merge under branch protection when you want it to.

Because scoring is rule-based, the same change always gets the same score, and every rule is one you can read.

## Configuration

Brindle reads **`.merge-risk.yml`** from the pull request **base** branch. Optional features are in the guides; JSON Schema coverage is in [docs/reference/config-schema.md](docs/reference/config-schema.md).

| Feature | What it does | Docs |
| --- | --- | --- |
| Auto-merge | Turns on GitHub native auto-merge for qualifying tiers. | [docs/guides/auto-merge.md](docs/guides/auto-merge.md) |
| Coverage | Factors Istanbul `coverage-final.json` into the score. | [docs/guides/coverage.md](docs/guides/coverage.md) |
| File patterns | Raises risk when changed paths match sensitive globs. | [docs/guides/file-patterns.md](docs/guides/file-patterns.md) |
| Author seniority | Maps author login to a raw score from your rules. | [docs/guides/author-seniority.md](docs/guides/author-seniority.md) |
| Service criticality | Risk from touching logical services in a root `services` catalog. | [docs/guides/service-criticality.md](docs/guides/service-criticality.md) |
| Branch age | Risk from how old the head commit is vs adapter timestamps. | [docs/guides/branch-age.md](docs/guides/branch-age.md) |
| Mutators | Multiplies the blended score after criteria (`junior_author`, `critical_service`). | [docs/guides/mutators.md](docs/guides/mutators.md) |
| Declarative rules | Extra weighted rules in config (MVP: `labels_any`). | [docs/guides/declarative-rules.md](docs/guides/declarative-rules.md) |
| Trusted plugins | Merge base-ref YAML plugin files into the same weight pool. | [docs/guides/trusted-plugins.md](docs/guides/trusted-plugins.md) |

## npm library for embedders

The same **deterministic** scoring engine is published on npm for teams who want merge-risk **inside their own Node.js tooling** (for example custom CI glue or a platform adapter you maintain). The package exposes `score`, YAML config loading, `buildRiskReport`, the **`PlatformAdapter`** type, and related types from `core/` ... it does **not** ship the GitHub Action or Octokit.

- **Install and quick example:** [packages/merge-risk-core/README.md](packages/merge-risk-core/README.md)
- **Adapter contracts and security model:** [docs/programmatic-use.md](docs/programmatic-use.md)

## Documentation

All guides, reference pages, and the full scoring write-up live in **[docs/README.md](docs/README.md)**.

## Contributing

Brindle is MIT licensed and built in the open. Setup and local workflow live in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](./LICENSE) ... a project by Buddy Shed.
