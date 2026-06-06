# Mutators (optional)

Mutators run **after** all weighted criteria have been blended into a base score. Each mutator can **multiply** that running score when its condition matches. Weights and thresholds are unchanged; see [Scoring pipeline](../concepts/scoring.md#mutators-multiply-after-the-blend). Mutators are applied in **sorted mutator id** order ([`sortedMutatorEntries`](../../core/scorer.ts)). Unknown mutator keys in config have no implementation and do not apply.

## Junior author

The **`junior_author`** mutator **multiplies** the weighted score after all criteria run when the change-request **author login** matches one of the configured **`logins`**. It uses the same neutral [`PRContext.author`](../../core/types.ts) string as `author_seniority`, compared **case-insensitively** after trimming. Use it for a small multiplicative bump on top of weighted criteria (for example interns or bots), not as a substitute for seniority scoring.

**1. Add `junior_author` under `mutators`** with a required **`options`** block:

```yaml
criteria:
  diff_size:
    weight: 100
mutators:
  junior_author:
    options:
      logins:
        - "intern-bot"
        - "dependabot"
      multiplier: 1.15   # must be strictly greater than 1
```

**`logins`** ... non-empty array of non-empty strings.

**`multiplier`** ... a finite number **strictly greater than 1**. Values at or below 1 are rejected by config validation.

You may set **`enabled: false`** on the mutator entry to keep the block in config while turning it off; **`options` is still required** when `junior_author` is present so the shape stays explicit.

## Critical service

The **`critical_service`** mutator **multiplies** the weighted score after criteria when the change touches at least one logical service listed under **`service_ids`**, using the same **root `services`** catalog and micromatch rules as **`service_criticality`** ([ADR 0009](../adrs/0009-service-criticality-criterion-config.md)). The scorer merges **`services`** into mutator options at apply time (you do not embed the catalog under `mutators.critical_service.options`).

**1.** Declare root **`services`** (if you have not already). **2.** Add **`critical_service`** under **`mutators`** with required **`options`**:

```yaml
services:
  payments:
    globs:
      - "src/payments/**"
criteria:
  diff_size:
    weight: 100
mutators:
  critical_service:
    options:
      service_ids:
        - "payments"
      multiplier: 1.25   # must be strictly greater than 1
```

**`service_ids`** ... non-empty array of non-empty strings; each id should match a key under root **`services`**.

**`multiplier`** ... strictly greater than 1 (same rule as `junior_author`).

With **`enabled: false`**, **`options` is still required** when `critical_service` is present.

## Mutators reference

| Mutator | Options | What it does |
| --- | --- | --- |
| `junior_author` | `logins` (non-empty list of non-empty strings), `multiplier` (number > 1) | Multiplies the running score when `PRContext.author` matches any listed login (case-insensitive). |
| `critical_service` | `service_ids` (non-empty list of non-empty strings), `multiplier` (number > 1) | Multiplies when any changed path matches root **`services`** globs for a listed service id. |

---

**See also:** [Documentation hub](../README.md) · [Scoring pipeline](../concepts/scoring.md) · [Service criticality](service-criticality.md)
