# Merge-risk config JSON Schema

This document mirrors [`schema/merge-risk-config.schema.json`](../../schema/merge-risk-config.schema.json). The schema file’s **`title`** and **`description`** state that it is a **subset**: it validates optional `declarative_rules`, `trusted_plugins`, and specific criterion/mutator option shapes when those keys appear. The root document has **`additionalProperties: true`**, so unknown top-level keys are allowed for forward compatibility.

**Defaults in the sections below:** this JSON Schema file defines **no** `default` keywords anywhere. Unless a field’s description in the schema text below notes otherwise, treat defaults as **unspecified in schema** (see [Runtime defaults (not in JSON Schema)](#runtime-defaults-not-in-json-schema) for behavior enforced in `core/`).

## Root document

| Property | Type | Required | `additionalProperties` | Notes |
| --- | --- | --- | --- | --- |
| *(document)* | `object` | `thresholds`, `criteria` | `true` | `$schema`, `$id`, `title`, `description` are metadata on the file. |

### `thresholds`

| Property | Type | Required | Notes |
| --- | --- | --- | --- |
| `thresholds` | `object` | yes | |
| `thresholds.low` | `number` | yes | Part of `thresholds` required set in schema. |
| `thresholds.medium` | `number` | yes | |
| `thresholds` (extras) | any | no | `additionalProperties: true` on `thresholds`. |

### `criteria`

| Property | Type | Required | Notes |
| --- | --- | --- | --- |
| `criteria` | `object` | yes | Keys are criterion ids (e.g. `diff_size`). |
| `criteria.<id>` | `object` | `weight` per entry | Each value: `required: ["weight"]`, `additionalProperties: true`. |
| `criteria.<id>.weight` | `number` | yes | |
| `criteria.<id>.enabled` | `boolean` | no | |
| `criteria.<id>.options` | `{}` (unconstrained in generic branch) | no | When `file_patterns` / `author_seniority` / `service_criticality` / `branch_age` are present, `allOf` tightens `options` (below). |

### `mutators`

| Property | Type | Required | Notes |
| --- | --- | --- | --- |
| `mutators` | `object` | no | |
| `mutators.<id>` | `object` | no generic required | `additionalProperties: true`; may include `enabled`, `options`. |
| `mutators.<id>.enabled` | `boolean` | no | |
| `mutators.<id>.options` | `{}` | no | When `junior_author` / `critical_service` present, `allOf` constrains shape. |

### `auto_merge`

| Property | Type | Required | Notes |
| --- | --- | --- | --- |
| `auto_merge` | `object` | no | `additionalProperties: true`. |
| `auto_merge.enabled` | `boolean` | no | |
| `auto_merge.tier` | `string` | no | |
| `auto_merge.method` | `string` | no | |

### `services`

| Property | Type | Required | Notes |
| --- | --- | --- | --- |
| `services` | `object` | no | Map service id → `$ref` **serviceCatalogEntry**. |

### `declarative_rules`

| Property | Type | Required | Notes |
| --- | --- | --- | --- |
| `declarative_rules` | `object` | no | Keys are rule ids; values match **declarativeRulesEntry**. |

### `trusted_plugins`

| Property | Type | Required | Notes |
| --- | --- | --- | --- |
| `trusted_plugins` | `object` | yes when present | `$ref` **trustedPluginsConfiguration**. |

## Definitions

### `filePatternsOptions`

`type: object`, **`additionalProperties: false`**.

| Property | Schema | Required |
| --- | --- | --- |
| `patterns` | array of objects: `glob` string `minLength: 1`, `score` number 0–100; rule object `required: ["glob","score"]`, `additionalProperties: false` | no |
| `aggregation` | `string` enum **`["max"]`** | no |

### `authorSeniorityOptions`

`type: object`, **`additionalProperties: false`**.

| Property | Schema | Required |
| --- | --- | --- |
| `rules` | array of `{ login` string `minLength: 1`, `score` number 0–100 `}` with `required: ["login","score"]`, `additionalProperties: false` | no |
| `default_score` | number 0–100 | no |
| `aggregation` | `string` enum **`["max"]`** | no |

### `serviceCatalogEntry`

`type: object`, **`additionalProperties: false`**, **`required: ["globs"]`**.

| Property | Schema |
| --- | --- |
| `globs` | array of string `minLength: 1`, **`minItems: 1`** |

### `serviceCriticalityOptions`

`type: object`, **`additionalProperties: false`**.

| Property | Schema |
| --- | --- |
| `aggregation` | `string` enum **`["max"]`** |
| `scores` | object with **`additionalProperties`** number 0–100 |
| `default_score` | number 0–100 |

### `branchAgeOptions`

`type: object`, **`additionalProperties: false`**.

| Property | Schema |
| --- | --- |
| `max_age_hours_for_cap` | number, **`exclusiveMinimum: 0`** |

### `juniorAuthorMutatorOptions`

`type: object`, **`additionalProperties: false`**, **`required: ["logins","multiplier"]`**.

| Property | Schema |
| --- | --- |
| `logins` | array of string `minLength: 1`, **`minItems: 1`** |
| `multiplier` | number, **`exclusiveMinimum: 1`** |

### `criticalServiceMutatorOptions`

`type: object`, **`additionalProperties: false`**, **`required: ["service_ids","multiplier"]`**.

| Property | Schema |
| --- | --- |
| `service_ids` | array of string `minLength: 1`, **`minItems: 1`** |
| `multiplier` | number, **`exclusiveMinimum: 1`** |

### `declarativeRulesEntry`

`type: object`, **`additionalProperties: false`**, **`required: ["weight"]`**.

| Property | Schema |
| --- | --- |
| `weight` | `number` |
| `enabled` | `boolean` |
| `options` | object `additionalProperties: false`: optional `labels_any` (array of string `minLength: 1`), optional `score` number 0–100 |

### `trustedPluginsConfiguration`

`type: object`, **`additionalProperties: false`**, **`required: ["directory","paths"]`**.

| Property | Schema |
| --- | --- |
| `directory` | string `minLength: 1` |
| `paths` | array of string `minLength: 1` |

## Conditional validation (`allOf`)

When the document includes **`criteria.file_patterns`**, the **`criteria.file_patterns`** entry is further constrained: `required: ["weight"]`, and **`options`** must match **filePatternsOptions** (same pattern for the following keys).

| Trigger (`criteria` contains key) | Extra constraint on that criterion’s entry |
| --- | --- |
| `file_patterns` | `options` → **filePatternsOptions** |
| `author_seniority` | `options` → **authorSeniorityOptions** |
| `service_criticality` | `options` → **serviceCriticalityOptions** |
| `branch_age` | `options` → **branchAgeOptions** |

When **`mutators`** contains **`junior_author`**:

- **`mutators.junior_author`**: `additionalProperties: false`; properties `enabled` (boolean), `options` (**juniorAuthorMutatorOptions**); **`required: ["options"]`**.

When **`mutators`** contains **`critical_service`**:

- **`mutators.critical_service`**: same pattern with **criticalServiceMutatorOptions** and **`required: ["options"]`**.

---

## Runtime defaults (not in JSON Schema)

These values are enforced in TypeScript when options are missing or invalid. They are **not** expressed as `default` in [`merge-risk-config.schema.json`](../../schema/merge-risk-config.schema.json). Do not document them as JSON Schema defaults in the sections above.

| Criterion / area | Option or behavior | Runtime default | Source |
| --- | --- | --- | --- |
| `diff_size` | `max_lines_for_cap` | **400** | [`core/criteria/diffSize.ts`](../../core/criteria/diffSize.ts) (`DEFAULT_CAP_LINES`) |
| `test_coverage` | `minimum_percent` | **80** | [`core/criteria/testCoverage.ts`](../../core/criteria/testCoverage.ts) (`DEFAULT_MINIMUM_PERCENT`) |
| `branch_age` | `max_age_hours_for_cap` | **168** (hours) | [`core/criteria/branchAge.ts`](../../core/criteria/branchAge.ts) (`DEFAULT_MAX_AGE_HOURS_FOR_CAP`) |
| `author_seniority` | `default_score` when author matches no rule | **0** if omitted/invalid | [`core/criteria/authorSeniority.ts`](../../core/criteria/authorSeniority.ts) (`defaultScoreFromOptions`) |
| `service_criticality` | `default_score` when catalog missing, no matches, or no changed files | **0** if omitted | [`core/criteria/serviceCriticality.ts`](../../core/criteria/serviceCriticality.ts) (`defaultScoreFromInput`) |

---

**See also:** [Documentation hub](../README.md) · [Criteria (built-ins)](criteria.md) · [Scoring pipeline](../concepts/scoring.md)
