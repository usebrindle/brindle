# Trusted plugins (optional)

**`trusted_plugins`** is an optional top-level block that lists **repository-relative paths** to small YAML **plugin definition files** on the **base branch** only ([ADR 0001](../adrs/0001-no-pr-head-execution.md)). The Action fetches each file via the GitHub Contents API at the PR base ref, then merges the resulting criteria into the same weight pool as **`criteria`** and **`declarative_rules`**. Breakdown rows use names of the form **`Trusted plugin: path/to/file.yaml`**.

- **`directory`** ... non-empty string; every path under **`paths`** must resolve **strictly inside** this directory (path guardrails reject `..` escapes and absolute paths).
- **`paths`** ... list of non-empty strings; each path must stay under **`directory`**.

MVP plugin file shape (each file is its own document):

- **`kind`**: must be **`labels_any`** today.
- **`weight`**: finite number **> 0** (this criterion’s share of the pool; same idea as `criteria.*.weight`).
- **`labels_any`** / **`score`**: same MVP semantics as declarative **`options`** (`labels_any` list, `score` 0–100).

```yaml
criteria:
  diff_size:
    weight: 90
    options:
      max_lines_for_cap: 400
trusted_plugins:
  directory: ".merge-risk-plugins"
  paths:
    - ".merge-risk-plugins/risk-labels.yaml"
```

Example **`.merge-risk-plugins/risk-labels.yaml`**:

```yaml
kind: labels_any
weight: 10
labels_any:
  - production
score: 75
```

## Trusted plugins reference

| Field | Shape | What it does |
| --- | --- | --- |
| **`trusted_plugins`** | `directory` (non-empty string), `paths` (list of non-empty strings) | Opt-in list of base-branch YAML plugin files; each path must lie strictly under **`directory`**. |
| Plugin file (MVP) | `kind: labels_any`, `weight` (> 0), optional `labels_any`, optional `score` (0–100) | One extra weighted criterion per file; fetched at scoring time from the base ref only. |

---

**See also:** [Documentation hub](../README.md) · [Scoring pipeline](../concepts/scoring.md) · [Declarative rules](declarative-rules.md)
