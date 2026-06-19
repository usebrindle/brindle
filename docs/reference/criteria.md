# Criteria (built-ins)

This page documents the **eight built-in** YAML keys under **`criteria.*`** only. **Mutator** option tables live in [Mutators](../guides/mutators.md). **Declarative rules** and **trusted plugins** field tables live in [Declarative rules](../guides/declarative-rules.md) and [Trusted plugins](../guides/trusted-plugins.md) so those guides stay self-contained.

JSON Schema under [`schema/merge-risk-config.schema.json`](../../schema/merge-risk-config.schema.json) validates slices of this config (for example `file_patterns` / `author_seniority` / `service_criticality` / `branch_age` / `author_familiarity` / `blast_radius` options when those keys are present) but does **not** enumerate every built-in criterion’s options. For keys the schema does not specialize, **runtime behavior in `core/criteria/`** is the contract.

| Criterion | Options (conceptual) | What it measures |
| --- | --- | --- |
| `diff_size` | `max_lines_for_cap` (runtime default **400** if missing/invalid) | Total added + deleted lines from [`PRContext`](../../core/types.ts). Raw score `(lines / cap) * 100`, capped at 100. [`diffSize.ts`](../../core/criteria/diffSize.ts) |
| `file_patterns` | `patterns` (list of `glob` + `score`), optional `aggregation: max` | Max `score` among rules whose globs match any changed path; 0 if no rules or no match. [`filePatterns.ts`](../../core/criteria/filePatterns.ts) |
| `author_seniority` | `rules` (`login` + `score`), optional `default_score`, optional `aggregation: max` | Author login → raw score; max among matching rules; if rules exist but none match, `default_score` or **0**. No rules → raw **0**. [`authorSeniority.ts`](../../core/criteria/authorSeniority.ts) |
| `test_coverage` | `minimum_percent` (runtime default **80** if missing/invalid) | Statement coverage from Istanbul summary vs minimum; raw 0 when at/above minimum. Self-disables when no coverage on context. [`testCoverage.ts`](../../core/criteria/testCoverage.ts) |
| `branch_age` | `max_age_hours_for_cap` (runtime default **168** if missing/invalid) | Head commit age in hours vs cap; requires `classifiedAtIso` and `headCommitCommittedAtIso`. [`branchAge.ts`](../../core/criteria/branchAge.ts) |
| `service_criticality` | optional `aggregation: max`, optional `scores` (service id → 0–100), optional `default_score`; root **`services`** merged at score time | Touches logical services from root catalog; max configured score over touched services; default path when no touch / no catalog. [`serviceCriticality.ts`](../../core/criteria/serviceCriticality.ts), [ADR 0009](../adrs/0009-service-criticality-criterion-config.md) |
| `author_familiarity` | optional `history_window_days` (hydration default **180**), optional `aggregation: max`, optional `characterization_scores` (`high` / `moderate` / `none`), optional `author_emails` | Pre-PR git familiarity per changed file from hydrated `contextualEvidence.familiarityFindings`; max aggregation (worst file wins). Defaults: high **15**, moderate **50**, none **85**. Requires head checkout when enabled — [Contextual evidence](../guides/contextual-evidence.md). [`authorFamiliarity.ts`](../../core/criteria/authorFamiliarity.ts) |
| `blast_radius` | optional `aggregation: max`, optional `characterization_scores` (`isolated` / `moderate` / `broad`), optional `enabled_extractors`, optional `thresholds` (`isolatedMax`, `moderateMax`) | Static transitive reach per changed file from hydrated `contextualEvidence.blastRadiusFindings`; max aggregation. Defaults: isolated **20**, moderate **55**, broad **90**; reach cut points isolated ≤**2**, moderate ≤**10**. Self-disables when every changed file is unsupported for analysis. Requires head checkout when enabled — [Contextual evidence](../guides/contextual-evidence.md). [`blastRadius.ts`](../../core/criteria/blastRadius.ts) |

## Contextual criteria (`author_familiarity`, `blast_radius`)

These criteria are **pure over hydrated context** ([ADR 0004](../adrs/0004-pure-criteria-over-hydrated-context.md)). Git blame/log, merge-base resolution, and dependency graph extraction run in the GitHub adapter when either criterion is enabled in base-branch config ([ADR 0010](../adrs/0010-contextual-analysis-at-head.md)).

**Workflow requirement:** Consumer GitHub workflows must check out the PR head (`ref: ${{ github.event.pull_request.head.sha }}`) before the Brindle Action. See [Contextual evidence](../guides/contextual-evidence.md) for `fetch-depth` guidance.

**Familiarity semantics (product):** Signals are measured at **merge-base**, not PR head commits. **Added** files (`changeKind: added`) characterize as **`high`** familiarity risk (greenfield gate). **Modified** legacy files with no pre-PR author history characterize as **`none`**. See [lld-author-familiarity-criterion.md](../designs/lld-author-familiarity-criterion.md).

**Blast radius semantics:** v1 extractors are `js_ts` and `stylesheet`. Changed paths with no enabled extractor are listed in `notAnalyzedForBlastRadius` on the PR comment. See [lld-blast-radius-criterion.md](../designs/lld-blast-radius-criterion.md) and [lld-dependency-graph-extractors.md](../designs/lld-dependency-graph-extractors.md).

Hydration-only options (`history_window_days`, `author_emails`, `enabled_extractors`, `thresholds`) are validated by JSON Schema when present but are **not** read during pure criterion evaluation — they configure adapter hydration only.

---

**See also:** [Documentation hub](../README.md) · [Config schema](config-schema.md) · [Scoring pipeline](../concepts/scoring.md) · [Contextual evidence guide](../guides/contextual-evidence.md)
