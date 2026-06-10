# Coverage scoring (optional)

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
      - uses: usebrindle/brindle/extensions/github-action@action-v0.1.2
        with:
          coverage_report_path: coverage/coverage-final.json
```

When there is no usable Istanbul coverage on the hydrated [`PRContext`](../../core/types.ts), `test_coverage` returns **`selfDisable: true`** after evaluate. The scorer then **excludes** that criterion from the active set for the run, so its configured weight does not enter the weight sum. Remaining **active** criteria are normalized over their weights only (see [Scoring pipeline](../concepts/scoring.md#self-disabling-after-evaluate)). Nothing breaks.

---

**See also:** [Documentation hub](../README.md) · [Scoring pipeline](../concepts/scoring.md) · [GitHub Action inputs](../reference/action-inputs.md)
