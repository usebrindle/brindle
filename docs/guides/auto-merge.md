# Auto-merge (optional)

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

**See also:** [Documentation hub](../README.md) · [Scoring pipeline](../concepts/scoring.md) · [ADR 0002](../adrs/0002-native-auto-merge.md)
