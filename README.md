<div align="center">

<img src="docs/assets/brindle-mark.png" alt="Brindle" width="160" />

# Brindle

**Know which pull requests are safe to merge without a human.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node.js-%3E%3D20-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![CI](https://github.com/usebrindle/brindle/actions/workflows/ci.yml/badge.svg)](https://github.com/usebrindle/brindle/actions/workflows/ci.yml)

</div>

> **Status … early development.** The scoring engine and GitHub Action path (`extensions/github-action`) run on pull requests when `.merge-risk.yml` is on the base branch. Native auto-merge is not wired yet (slice 09). Watch or star the repo to follow along, and see the [design docs](docs/designs/) and [ADRs](docs/adrs/) for the thinking behind it.

---

## The problem

AI made writing code fast. It did not make reviewing it fast. Once a team adopts AI coding tools, pull request volume climbs and review becomes the bottleneck. Teams have written about this and reached the same conclusion … most changes do not need a human reading every line, but some absolutely do. The hard part is knowing which is which, consistently and on every change.

## What Brindle does

Brindle scores every pull request against criteria you define, then tells you the risk tier and what should happen next. Low-risk changes can merge on their own. Risky ones get held for a human.

- **Deterministic.** No generative AI, no LLM calls, zero token cost. The score is computed from rules you can read and audit. The same change always gets the same score.
- **Runs in your own CI.** Brindle is a CI extension, not a hosted service. Your code never leaves your pipeline.
- **You own the rules.** Diff size, file sensitivity, test coverage, author seniority, service criticality, branch age, and your own custom rules. Every weight is yours to set.
- **Native auto-merge, safely.** When a change is low risk, Brindle enables your platform's native auto-merge. Your branch protection, required checks, and approvals all still apply. Brindle decides. The platform enforces.

Brindle is the judgment layer. Your platform is the enforcement layer.

## How it will work

Add a workflow and a config file. That is the whole install.

```yaml
# .github/workflows/merge-risk.yml
name: Merge risk
on:
  pull_request:

jobs:
  brindle:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      checks: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: ./extensions/github-action
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

For a published version, replace the path with `uses: usebrindle/brindle/extensions/github-action@vX` once tags exist.

```yaml
# .merge-risk.yml (on your default branch / PR base ref)
thresholds:
  low: 30
  medium: 60

criteria:
  diff_size:
    weight: 100
    options:
      max_lines_for_cap: 200
```

The example below shows additional criteria planned in the LLD; only built-ins shipped in this repo apply today.

```yaml
# .merge-risk.yml — fuller example (criteria beyond diff_size ship over time)
thresholds:
  low: 30
  medium: 60

criteria:
  diff_size:
    weight: 20
  file_patterns:
    weight: 25
    options:
      high_risk: ["src/auth/**", "src/payments/**"]
  test_coverage:
    weight: 20
  author_seniority:
    weight: 15
  service_criticality:
    weight: 10
  branch_age:
    weight: 10

auto_merge:
  enabled: true
  tier: low
  method: squash
```

When `auto_merge` is on, the consumer workflow also needs **`contents: write`** so the Action can enable native auto-merge. See the [LLD consumer example](docs/designs/lld-merge-risk-classifier.md) and [ADR 0002](docs/adrs/0002-native-auto-merge.md).

## How the score works

Brindle is deterministic on purpose, so you can read exactly how a verdict is reached.

1. Each enabled criterion scores the change from 0 to 100, where higher is riskier.
2. Each score is multiplied by its weight. Weights are normalized to total 100, so adding or removing a criterion never requires rebalancing the others by hand.
3. Mutators adjust the result. A junior author or a high-criticality service raises the score.
4. The final score maps to a tier. LOW, MEDIUM, or HIGH, using your thresholds.

Nothing is hidden. If you want to know why a change scored the way it did, the breakdown shows every criterion's contribution.

## What you will see

Brindle posts a check and a comment to the pull request.

```
## Merge Risk Assessment … MEDIUM (score 52)

| Criterion           | Score | Weight | Contribution | Notes                          |
|---------------------|-------|--------|--------------|--------------------------------|
| Diff Size           | 60    | 20%    | 12.0         | 312 lines changed              |
| File Patterns       | 80    | 25%    | 20.0         | touches src/auth/login.ts      |
| Test Coverage       | 20    | 20%    | 4.0          | coverage 86% on changed lines  |
| Author Seniority    | 0     | 15%    | 0.0          | senior author                  |
| Service Criticality | 40    | 10%    | 4.0          | medium criticality             |
| Branch Age          | 30    | 10%    | 3.0          | open 4 days                    |

Result … human review recommended, change touches authentication paths.
```

## Roadmap

- [x] Core scoring engine
- [x] GitHub Action … score, comment, check run (path action + committed `ncc` bundle)
- [ ] Extension testing … Vitest coverage for `extensions/**/*.ts` (and tests under `test/`), plus optional Sonar `sonar.sources` alignment once `lcov` includes that tree
- [ ] Native auto-merge on low-risk changes
- [ ] Coverage formats … Istanbul, then lcov and Cobertura
- [ ] GitLab CI component
- [ ] Bitbucket Pipe

## Documentation

- [Architecture Decision Records](docs/adrs/) … the why behind the design
- [Low-level design](docs/designs/) … the how

## Contributing

Brindle is MIT licensed and built in the open. Development setup, tooling, and local workflow live in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](./LICENSE) … a project by Buddy Shed.
