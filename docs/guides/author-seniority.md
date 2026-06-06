# Author seniority scoring (optional)

The **`author_seniority`** criterion scores pull requests using the **author login** on the change request. It does not call external directory APIs: you define tiers in base-branch config by listing logins and scores. Matching uses the same login string the platform adapter puts on [`PRContext.author`](../../core/types.ts) (on GitHub, the pull request author login), compared **case-insensitively** after trimming whitespace.

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

**See also:** [Documentation hub](../README.md) · [Scoring pipeline](../concepts/scoring.md) · [Config schema](../reference/config-schema.md)
