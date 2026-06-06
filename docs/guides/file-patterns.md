# File-pattern scoring (optional)

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

**See also:** [Documentation hub](../README.md) · [Scoring pipeline](../concepts/scoring.md) · [Config schema](../reference/config-schema.md)
