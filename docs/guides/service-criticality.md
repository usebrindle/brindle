# Service criticality (optional)

The **`service_criticality`** criterion scores risk when changed files fall under **logical services** you define once in a root **`services`** catalog, then attach numeric risk per service via **`scores`**. See [ADR 0009](../adrs/0009-service-criticality-criterion-config.md) and [`core/criteria/serviceCriticality.ts`](../../core/criteria/serviceCriticality.ts).

Keep **`services`** at the **document root** (never under `criteria.service_criticality.options`). JSON Schema [`serviceCatalogEntry`](../../schema/merge-risk-config.schema.json) requires each service to use the key **`globs`** (array of repo-relative micromatch patterns).

```yaml
# excerpt — show root `services` beside the criterion
thresholds:
  low: 30
  medium: 60

services:
  payments:
    globs:
      - "src/payments/**"
  auth:
    globs:
      - "src/auth/**"

criteria:
  diff_size:
    weight: 70
    options:
      max_lines_for_cap: 200
  service_criticality:
    weight: 30
    options:
      aggregation: max
      default_score: 10
      scores:
        payments: 80
        auth: 60
```

## Configuration shape

### Root `services`

Optional mapping: **service id** (YAML key) → `{ globs: string[] }` with at least one non-empty glob per service. Globs are repository-relative [micromatch](https://github.com/micromatch/micromatch) patterns (same path source as `file_patterns`). The catalog defines **which paths belong to which service**; it carries no numeric score. The schema property name **`globs`** is required (not `patterns` or other aliases).

### `criteria.service_criticality`

Under **`criteria.service_criticality`**:

- **`weight`** (required) — share of the active criteria pool (see [Scoring pipeline](../concepts/scoring.md)).
- **`enabled`** (optional) — omit or `true` to run; `false` disables this criterion.
- **`options`** (optional object; empty `{}` is valid):
  - **`aggregation`** — optional; only **`max`** is supported when present. When multiple services are touched, the raw score is the **maximum** of the per-service configured scores (see below).
  - **`scores`** — optional map **service id → number 0–100**. When a changed path matches a service’s globs, that service’s configured score participates in aggregation. If a touched service has **no** entry in **`scores`**, its configured score is treated as **0** at runtime ([`configuredScoreForServiceOrZero`](../../core/criteria/serviceCriticality.ts)).
  - **`default_score`** — optional 0–100 when **no** configured service matches any changed path, or when there are no changed files. If omitted, the runtime uses **0**.

Validated YAML keeps **`services`** at the **document root** only. The scorer merges root **`services`** into the object passed to `evaluate` for this criterion ([`mergeOptionsForCriterionEvaluation`](../../core/scorer.ts)); do not nest **`services`** under `criteria.service_criticality.options`.

## Scoring behavior (runtime)

- **No changed files:** raw score is **`default_score`** (or **0** if omitted).
- **No `services` catalog or empty catalog:** raw score is **`default_score`**, with a justification that no catalog is configured.
- **Changed paths but none match any service globs:** raw score is **`default_score`**.
- **One or more services touched:** raw score is **`max`** of the configured scores for those touched service ids (missing keys in **`scores`** count as **0**).

---

**See also:** [Documentation hub](../README.md) · [Scoring pipeline](../concepts/scoring.md) · [Mutators](mutators.md) (critical_service) · [Config schema](../reference/config-schema.md)
