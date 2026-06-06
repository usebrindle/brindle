# Declarative rules (optional)

**`declarative_rules`** is an optional top-level map. Each key is a **rule id** (your choice, stable string). Each entry has the same shape as a built-in criterion: **`weight`**, optional **`enabled`**, and **`options`**. Declarative rules share the same weight pool as **`criteria`** and appear in the breakdown with display names of the form **`Declarative rule: your_rule_id`** (using your YAML key).

MVP interpreter: **`labels_any`** (list of non-empty strings) and **`score`** (0–100). If **any** label on the change request matches one of the strings (**case-insensitive**, after trimming), the rule’s raw score is **`score`**; otherwise the raw score is 0. Config is read from the **base branch** only ([ADR 0001](../adrs/0001-no-pr-head-execution.md)).

```yaml
criteria:
  diff_size:
    weight: 90
    options:
      max_lines_for_cap: 400
declarative_rules:
  hot_labels:
    weight: 10
    options:
      labels_any:
        - database
        - security
      score: 70
```

## Declarative rules reference

| Field | Options | What it does |
| --- | --- | --- |
| Each key under **`declarative_rules`** | `weight`, optional `enabled`, optional `options` | Extra weighted signals interpreted by the engine (same pool as **`criteria`**). |
| (MVP) `options` | `labels_any` (list of non-empty strings), `score` (0–100) | Raw score is **`score`** when any PR label matches any entry in **`labels_any`** (case-insensitive); otherwise 0. |

---

**See also:** [Documentation hub](../README.md) · [Scoring pipeline](../concepts/scoring.md) · [Trusted plugins](trusted-plugins.md)
