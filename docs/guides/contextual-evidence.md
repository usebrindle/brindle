# Contextual evidence (optional)

**Author familiarity** and **blast radius** add per-file evidence to merge-risk scoring: how well the PR author knew each changed path *before this PR*, and how many other files statically depend on each changed path. Findings feed two optional criteria (`author_familiarity`, `blast_radius`) and a collapsible **Contextual evidence** section in the PR comment (below the score breakdown, not a second merge verdict).

Config and weights still load from the **base branch** only ([ADR 0001](../adrs/0001-no-pr-head-execution.md)). When these criteria are enabled, Brindle performs **read-only** git and static parsing at the PR head under [ADR 0010](../adrs/0010-contextual-analysis-at-head.md).

## 1. Checkout the PR head before Brindle

Contextual hydration needs a real git clone: `git blame`, `git log`, `git merge-base`, and a full-repo dependency graph walk. The default GitHub Actions checkout (merge ref) is not enough — you must check out the **head commit** of the pull request **before** the Brindle step.

```yaml
name: Merge risk
on:
  pull_request:

jobs:
  brindle:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      checks: write
      issues: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          fetch-depth: 0
      - uses: usebrindle/brindle/extensions/github-action@action-v0.1.2
```

**`ref`** — Must be `github.event.pull_request.head.sha` (or an equivalent head SHA). Brindle reads source and git objects at that commit while still loading `.merge-risk.yml` from the base ref via the GitHub API.

**`fetch-depth`** — Controls how much history is available for familiarity (git log / blame at merge-base):

| Value | Tradeoff |
| --- | --- |
| `0` (full history) | Most accurate familiarity signals; slowest clone on large repos. **Recommended default.** |
| `1` (shallow) | Fastest clone; merge-base and blame may be incomplete — familiarity can undercount pre-PR commits and line ownership. |
| N (e.g. `500`) | Middle ground when full history is too slow; ensure N covers your `history_window_days` plus typical branch depth. |

If contextual criteria are enabled and no checkout is present, the Action fails with a message pointing here (`GITHUB_WORKSPACE` must be set).

When **neither** `author_familiarity` nor `blast_radius` is enabled in base-branch config, Brindle skips checkout-dependent contextual I/O (same gating pattern as optional Istanbul coverage).

## 2. Enable criteria in `.merge-risk.yml`

Add weights and options on the **base branch** (merge into default branch before relying on them in PRs):

```yaml
thresholds:
  low: 30
  medium: 60

criteria:
  diff_size:
    weight: 40
    options:
      max_lines_for_cap: 400
  author_familiarity:
    weight: 30
    options:
      history_window_days: 180
      aggregation: max
      characterization_scores:
        high: 15
        moderate: 50
        none: 85
  blast_radius:
    weight: 30
    options:
      aggregation: max
      enabled_extractors:
        - js_ts
        - stylesheet
      characterization_scores:
        isolated: 20
        moderate: 55
        broad: 90
      thresholds:
        isolatedMax: 2
        moderateMax: 10
```

Both criteria aggregate per-file characterizations with **`max`** (worst file wins). Option tables and runtime defaults are in [Criteria (built-ins)](../reference/criteria.md).

**Author identity:** Familiarity queries use git **email**. Hydration resolves email from the head commit author, GitHub noreply patterns (`{login}@users.noreply.github.com`), and optional `author_emails` overrides in config.

**Blast radius extractors (v1):** `js_ts` (`.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts`) and `stylesheet` (`.css`, `.scss`, `.sass`). Changed files with no enabled extractor appear under **not analyzed** in the PR comment; if every changed file is unsupported, `blast_radius` **self-disables** for that run.

## 3. What appears on the PR

When contextual criteria are enabled and hydration succeeds:

- Score breakdown rows for **Author familiarity** and **Blast radius** (justifications point to the evidence block).
- A collapsible **Contextual evidence** `<details>` section with per-file familiarity and blast-radius lines, limitations, and skipped paths.

The tier verdict and merge recommendation are unchanged — contextual evidence is explanatory, not a second score.

## Relationship to other criteria

| Signal | Criterion | Source |
| --- | --- | --- |
| Login tier | `author_seniority` | Team-configured rules |
| File history | `author_familiarity` | Git at merge-base (pre-PR) |
| Path globs | `file_patterns` | Config patterns |
| Static dependents | `blast_radius` | Unified dependency graph at head |

A senior engineer touching an unfamiliar shared module is a common reason to enable both `author_seniority` and `author_familiarity` with independent weights.

---

**See also:** [Documentation hub](../README.md) · [Criteria reference](../reference/criteria.md) · [ADR 0010](../adrs/0010-contextual-analysis-at-head.md) · [Design overview](../designs/lld-contextual-evidence-overview.md)
