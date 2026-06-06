# Scoring pipeline

This page is the **canonical** description of how Brindle turns base-branch YAML and a hydrated [`PRContext`](../../core/types.ts) into a single **0–100** score, a **tier** (LOW / MEDIUM / HIGH), and a per-signal breakdown. The [root README](../../README.md) keeps a short mental model only; details live here.

## Criteria and raw scores

A **criterion** is one signal the engine evaluates. Each enabled criterion produces a **raw score from 0 to 100** for that run, where **higher means riskier** for that signal (for example, a large diff or a sensitive path glob).

Built-in criteria are registered in [`core/criteria/builtins.ts`](../../core/criteria/builtins.ts). Declarative rules and trusted plugins add **additional** criteria with internal ids (see the [LLD](../designs/lld-merge-risk-classifier.md)).

## Weights are ratios (not points)

Each **active** criterion has a **`weight`** from config. Brindle sums the weights of **only the criteria that are active for this run**, then gives each criterion a **normalized** share:

- Share for criterion *i* = `weight_i / sum(weights of all active criteria)`.
- Only the **ratio** between weights matters: `60` + `40` behaves like `6` + `4`.
- If **exactly one** criterion is active, its weight does not change the math: it always receives 100% of the weighted blend (any positive weight normalizes to 100%).

The breakdown rows show each active criterion’s **normalized weight** (as a percentage) and its **weighted** contribution: raw score × (normalized weight / 100), summed to the **base score** (before mutators). Implementation: [`weightedPartsForActive`](../../core/scorer.ts) and [`computeBreakdown`](../../core/scorer.ts).

## Thresholds map score to tier

After mutators (below), the final score is compared to **`thresholds.low`** and **`thresholds.medium`** ([`tierForScore`](../../core/scorer.ts)):

- **LOW:** final score `<= low`
- **MEDIUM:** final score `<= medium` (and above `low`)
- **HIGH:** final score above `medium`

Invalid thresholds (for example `low >= medium`) are rejected when scoring runs.

## Which criteria are active?

For each configured criterion id (built-ins, then declarative, then trusted plugins, in sorted order), the scorer resolves a **gate** ([`criterionGate`](../../core/scorer.ts), [`resolveOneCriterion`](../../core/scorer.ts)):

- **Omit** — no configuration for that id.
- **Disabled** — `enabled: false`, no implementation, `isEnabled` returned false, or the criterion **self-disabled** after evaluation (see below).
- **Active** — evaluate ran and did **not** set `selfDisable: true`.

Only **active** criteria contribute to the weight sum and breakdown. Disabled criteria ids are collected separately on the result (`disabledCriteria`).

### Self-disabling after evaluate

Some criteria return **`selfDisable: true`** on the [`CriterionResult`](../../core/types.ts). That means “exclude me from this run as if I were disabled.” Examples: `test_coverage` when there is no usable Istanbul coverage on the context ([`testCoverage.ts`](../../core/criteria/testCoverage.ts)); `branch_age` when head commit timestamps cannot be interpreted ([`branchAge.ts`](../../core/criteria/branchAge.ts)).

**Weight behavior:** those criteria are **not** in the active set, so their configured weights **do not** participate in the sum. The remaining active criteria’s weights are normalized over **their** sum only—there is no separate “redistribution” pass; exclusion from the active set is the whole mechanism.

## Mutators multiply after the blend

**Mutators** run **after** the weighted sum of active criteria ([`applyMutators`](../../core/scorer.ts)). They see the **clamped** base score (0–100), then apply in **sorted mutator id** order. Each mutator’s `apply` returns either:

- **`null`** — does not apply; score unchanged.
- A **finite factor strictly greater than 0** — running score becomes `clamp(running * factor)` (still 0–100 after each step).

Built-in mutators use conditional multipliers ([`mutatorPrimitives.ts`](../../core/mutators/mutatorPrimitives.ts)): when the condition matches, the factor must be a valid **`multiplier` &gt; 1** or the scorer throws. Unknown mutator ids in config do not apply (no implementation).

## Service catalog merge (criterion and mutator)

For **`service_criticality`**, the scorer merges root **`services`** into the options object passed to `evaluate` ([`mergeOptionsForCriterionEvaluation`](../../core/scorer.ts)). For **`critical_service`**, root **`services`** is merged into mutator apply options ([`mergeOptionsForMutatorApplication`](../../core/scorer.ts)). Validated YAML keeps **`services`** at the document root only ([ADR 0009](../adrs/0009-service-criticality-criterion-config.md)).

## Quick start field guide (from the README setup)

These bullets were relocated from the root README so the quick start stays short; they belong with the full pipeline.

### `thresholds`

Two numbers, **`low`** and **`medium`**, partition the final 0–100 score:

| Final score | Tier | Meaning |
| --- | --- | --- |
| 0 to `low` | **LOW** | At or below the `low` line. |
| above `low` through `medium` | **MEDIUM** | Between the two cut lines. |
| above `medium` | **HIGH** | Above the `medium` line. |

Lower cut lines flag more PRs as MEDIUM/HIGH; higher lines let more land in LOW.

### `criteria` and `weight`

You enable built-in criteria by listing them under **`criteria`**. Each needs a **`weight`** (see [Weights are ratios](#weights-are-ratios-not-points) above). Some criteria accept **`options`**; see [Criteria (built-ins)](../reference/criteria.md) and the per-feature guides.

### `diff_size` starter option `max_lines_for_cap`

The number of **added + deleted** lines at which `diff_size` reaches raw score **100**. The raw score scales linearly: `(lines / cap) * 100`, capped at 100. The **runtime** default cap when the option is missing or invalid is **400** (not expressed in JSON Schema); see [Runtime defaults](../reference/config-schema.md#runtime-defaults-not-in-json-schema) in the schema reference appendix.

---

## Pipeline diagram

```mermaid
flowchart LR
  config[ScoringConfig]
  resolve[ResolveActiveCriteria]
  base[WeightedBaseScore]
  mut[ApplyMutatorsSorted]
  tier[MapThresholdsToTier]
  config --> resolve --> base --> mut --> tier
```

---

**See also:** [Documentation hub](../README.md) · [Config schema](../reference/config-schema.md) · [Criteria reference](../reference/criteria.md)
