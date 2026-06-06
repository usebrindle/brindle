# Branch age (optional)

This is **not** “how long the pull request has been open.” It measures how **stale the head commit** is: elapsed time from the head commit’s committed-at timestamp to the instant Brindle classified the change (`headCommitCommittedAtIso` → `classifiedAtIso` on [`PRContext`](../../core/types.ts)). Higher raw scores mean an older tip relative to when Brindle ran. Implementation: [`core/criteria/branchAge.ts`](../../core/criteria/branchAge.ts), [`core/criteria/branchAge.types.ts`](../../core/criteria/branchAge.types.ts).

```yaml
# excerpt
thresholds:
  low: 30
  medium: 60

criteria:
  diff_size:
    weight: 80
    options:
      max_lines_for_cap: 200
  branch_age:
    weight: 20
    options:
      max_age_hours_for_cap: 168   # optional; default 168h in runtime if omitted/invalid
```

## Options

Under **`criteria.branch_age.options`**:

- **`max_age_hours_for_cap`** (optional) — positive finite number. Head commit age in **hours** at which this criterion reaches raw score **100**. Age is `classifiedAtIso` minus `headCommitCommittedAtIso` (both from [`PRContext`](../../core/types.ts); criteria do not read the system clock; see ADR 0004). If the option is missing or invalid, the runtime uses **168** hours ([`DEFAULT_MAX_AGE_HOURS_FOR_CAP`](../../core/criteria/branchAge.ts)).

## When the criterion runs

The criterion defines **`isEnabled`**: it requires non-empty, parseable **`classifiedAtIso`** and **`headCommitCommittedAtIso`** on the context. If either is missing or unusable, the criterion is **excluded** from the active set (same as other disabled criteria), so its weight does not participate in that run.

On GitHub, the adapter **may omit** `headCommitCommittedAtIso` when the commit API returns no usable date ([`GitHubAdapter`](../../adapters/github/GitHubAdapter.ts)); in that case **`branch_age`** will not run.

## Evaluate

When enabled and timestamps parse: raw score is `(ageHours / max_age_hours_for_cap) * 100`, capped at 100. If parsing fails after evaluate starts, the result can use **`selfDisable: true`**, excluding the criterion from the active set for that run (see [Scoring pipeline](../concepts/scoring.md#self-disabling-after-evaluate)).

---

**See also:** [Documentation hub](../README.md) · [Scoring pipeline](../concepts/scoring.md) · [Config schema](../reference/config-schema.md)
