# GitHub Action extension

JavaScript Action (`node24`) that runs Brindle on `pull_request` events: loads **`.merge-risk.yml` from the pull request base ref** (ADR 0001), builds `PRContext` via `GitHubAdapter`, scores with `score()`, publishes with `writeResult()` (Check Run + optional comment).

## Layout

| Path | Purpose |
| --- | --- |
| `action.yml` | Action metadata and inputs |
| `index.ts` | Runner entry (top-level `await`) |
| `runMergeRiskGithubAction.ts` | Fetch base config → score → write results |
| `dist/` | **`ncc` bundle** (committed). Rebuild after changing sources. |

## Rebuild `dist/`

From the repository root:

```bash
npm run build:github-action
```

CI runs the same command and **`git diff --exit-code extensions/github-action/dist`** so the committed bundle cannot drift from sources.

## Consumer workflow

Permissions depend on whether **native auto-merge** is enabled in `.merge-risk.yml` (`auto_merge.enabled: true` calls GitHub’s `enablePullRequestAutoMerge` mutation; see [ADR 0002](docs/adrs/0002-native-auto-merge.md)):

```yaml
permissions:
  contents: write
  checks: write
  pull-requests: write
```

Use **`contents: read`** only when auto-merge stays off (check + comment only).

```yaml
permissions:
  contents: read
  checks: write
  pull-requests: write
```

Use `uses: ./extensions/github-action` (path) or, once published, `uses: usebrindle/brindle/extensions/github-action@vX` once tags exist.

### Bootstrap: config not on the default branch yet

The Contents API always reads **`merge_risk_file_path` from the pull request base ref**. If that file is not on `main` yet (for example the same PR introduces it), set **`skip_when_merge_risk_missing_on_base: true`** so the job succeeds with an explanatory log until the file is merged. Defaults to **`false`** so a missing file fails loudly when you expect Brindle to always run. This does **not** read YAML from the PR head (ADR 0001).

## First-time enablement

After `.merge-risk.yml` exists on the default branch, omit **`skip_when_merge_risk_missing_on_base`** or set it to **`false`** so a missing or mistyped config path fails the job again.

### Check conclusion policy (ADR 0003)

- **`informational_check_conclusion`** (default **true**): the Check Run conclusion is always **`success`** so the workflow job and required checks stay green; MEDIUM/HIGH remain visible in the check summary and PR comment.
- Set **`informational_check_conclusion: false`** to use **`neutral`** / **`action_required`** / **`failure`** tier mapping again.
- **`fail_on_high`** (default **false**): when informational mode is off, maps HIGH to **`failure`** instead of **`action_required`** so branch protection can block merges on HIGH only.
