# Design documents

Low-level design (LLD) specs for Brindle. These describe **target product behavior** for implementers and reviewers. Shipped code may lag; when they diverge, these docs are the contract to converge toward unless superseded by an ADR.

## Core product

| Document | Description |
| --- | --- |
| [lld-merge-risk-classifier.md](lld-merge-risk-classifier.md) | Platform-agnostic merge-risk engine: scorer, criteria, mutators, adapters, GitHub Action extension. |

## Contextual evidence (validated demo → product)

Peter's contextual evidence items **author familiarity** and **blast radius** were validated in the v2 evidence demo ([`v2/evidence-demo/VALIDATION.md`](../../../v2/evidence-demo/VALIDATION.md), 2026-06-17). The demo proved the *explanation shape* on real pull requests. These LLDs specify how that capability lifts into `@usebrindle/merge-risk-core` as weighted criteria plus evidence-rich PR comments.

**Important:** Product specs **correct** several demo behaviors (pre-PR familiarity, greenfield adds, pluggable multi-language extractors). Do not treat the demo as the product contract where these docs differ.

| Document | Description |
| --- | --- |
| [lld-contextual-evidence-overview.md](lld-contextual-evidence-overview.md) | Umbrella: scope, layering, hydration, demo-gap corrections, build order. |
| [lld-author-familiarity-criterion.md](lld-author-familiarity-criterion.md) | `author_familiarity` criterion: merge-base git signals, greenfield gate, scoring, robustness. |
| [lld-dependency-graph-extractors.md](lld-dependency-graph-extractors.md) | Pluggable `DependencyExtractor` port, registry, unified graph, v1/v2 language matrix. |
| [lld-blast-radius-criterion.md](lld-blast-radius-criterion.md) | Pure blast-radius analyzer + `blast_radius` criterion (language-blind). |
| [lld-contextual-evidence-reporting.md](lld-contextual-evidence-reporting.md) | Contextual evidence sections in `RiskReport` / PR comment markdown. |

## Related ADRs

| ADR | Relevance |
| --- | --- |
| [0001](../adrs/0001-no-pr-head-execution.md) | Config/plugins from base ref only. |
| [0004](../adrs/0004-pure-criteria-over-hydrated-context.md) | Criteria pure over `PRContext`; I/O in hydration. |
| [0005](../adrs/0005-read-findings-not-run-tools.md) | Do not run external CI tools; read their output. |
| [0010](../adrs/0010-contextual-analysis-at-head.md) | Read-only git/source analysis at `headSha` for contextual criteria. |

## Historical reference

The v2 evidence demo design set lives under [`v2/docs/design/`](../../../v2/docs/design/). It remains the record of the experiment; Brindle product specs above supersede it where they explicitly differ.
