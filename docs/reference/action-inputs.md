# GitHub Action inputs

Brindle’s composite action is defined in [`extensions/github-action/action.yml`](../../extensions/github-action/action.yml). Workflow jobs should reference that path in this repository (for example `uses: usebrindle/brindle/extensions/github-action@action-v0.1.1`), which resolves to the directory containing `action.yml` and `dist/index.js`.

The table below mirrors **`action.yml`** `inputs` blocks. **Defaults** are those declared in the YAML `default:` keys.

| Input | Required | Default (from `action.yml`) | Behavior |
| --- | --- | --- | --- |
| `github_token` | no | `${{ github.token }}` | Token for base-ref config read, Check Run, and PR comment (see descriptions in `action.yml` for permission expectations). |
| `merge_risk_file_path` | no | `.merge-risk.yml` | Path to merge-risk config on the **pull request base ref** (ADR 0001). |
| `skip_when_merge_risk_missing_on_base` | no | `"false"` | When `"true"`, exit successfully if the config file is missing on the base ref (first-time setup). |
| `coverage_report_path` | no | `""` | Repository-root-relative path to Istanbul `coverage-final.json` on the **PR head**; empty skips the Contents API fetch (ADR 0005). |
| `informational_check_conclusion` | no | `"true"` | When `true`, Check Run conclusion stays **success** for all tiers; MEDIUM/HIGH still appear in output. When `false`, ADR 0003-style conclusions apply. |
| `fail_on_high` | no | `"false"` | When `informational_check_conclusion` is `false`, if `true` maps HIGH to **failure** instead of `action_required`. Ignored when informational mode is `true`. |

---

**See also:** [Documentation hub](../README.md) · [Coverage guide](../guides/coverage.md) · [ADR 0003](../adrs/0003-check-runs-over-commit-statuses.md)
