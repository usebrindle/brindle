# Criteria (built-ins)

This page documents the **six built-in** YAML keys under **`criteria.*`** only. **Mutator** option tables live in [Mutators](../guides/mutators.md). **Declarative rules** and **trusted plugins** field tables live in [Declarative rules](../guides/declarative-rules.md) and [Trusted plugins](../guides/trusted-plugins.md) so those guides stay self-contained.

JSON Schema under [`schema/merge-risk-config.schema.json`](../../schema/merge-risk-config.schema.json) validates slices of this config (for example `file_patterns` / `author_seniority` / `service_criticality` / `branch_age` options when those keys are present) but does **not** enumerate every built-in criterion’s options. For keys the schema does not specialize, **runtime behavior in `core/criteria/`** is the contract.

| Criterion | Options (conceptual) | What it measures |
| --- | --- | --- |
| `diff_size` | `max_lines_for_cap` (runtime default **400** if missing/invalid) | Total added + deleted lines from [`PRContext`](../../core/types.ts). Raw score `(lines / cap) * 100`, capped at 100. [`diffSize.ts`](../../core/criteria/diffSize.ts) |
| `file_patterns` | `patterns` (list of `glob` + `score`), optional `aggregation: max` | Max `score` among rules whose globs match any changed path; 0 if no rules or no match. [`filePatterns.ts`](../../core/criteria/filePatterns.ts) |
| `author_seniority` | `rules` (`login` + `score`), optional `default_score`, optional `aggregation: max` | Author login → raw score; max among matching rules; if rules exist but none match, `default_score` or **0**. No rules → raw **0**. [`authorSeniority.ts`](../../core/criteria/authorSeniority.ts) |
| `test_coverage` | `minimum_percent` (runtime default **80** if missing/invalid) | Statement coverage from Istanbul summary vs minimum; raw 0 when at/above minimum. Self-disables when no coverage on context. [`testCoverage.ts`](../../core/criteria/testCoverage.ts) |
| `branch_age` | `max_age_hours_for_cap` (runtime default **168** if missing/invalid) | Head commit age in hours vs cap; requires `classifiedAtIso` and `headCommitCommittedAtIso`. [`branchAge.ts`](../../core/criteria/branchAge.ts) |
| `service_criticality` | optional `aggregation: max`, optional `scores` (service id → 0–100), optional `default_score`; root **`services`** merged at score time | Touches logical services from root catalog; max configured score over touched services; default path when no touch / no catalog. [`serviceCriticality.ts`](../../core/criteria/serviceCriticality.ts), [ADR 0009](../adrs/0009-service-criticality-criterion-config.md) |

---

**See also:** [Documentation hub](../README.md) · [Config schema](config-schema.md) · [Scoring pipeline](../concepts/scoring.md)
