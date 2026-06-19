# Brindle documentation

Brindle scores pull requests from **base-branch** YAML ([ADR 0001](adrs/0001-no-pr-head-execution.md)). Start with the [root README](../README.md) for a five-minute quick start, then use the pages below when you need depth, field-level accuracy, or the full scoring pipeline.

## Guides

How to turn features on in `.merge-risk.yml` and the GitHub workflow.

| Guide | Description |
| --- | --- |
| [Auto-merge](guides/auto-merge.md) | Enable GitHub native auto-merge for qualifying tiers. |
| [Coverage](guides/coverage.md) | Istanbul `coverage-final.json` and the `test_coverage` criterion. |
| [File patterns](guides/file-patterns.md) | Risk from changed paths matching configured globs. |
| [Author seniority](guides/author-seniority.md) | Map author login to a raw score from your rules. |
| [Service criticality](guides/service-criticality.md) | Risk from touching logical services (root `services` catalog). |
| [Branch age](guides/branch-age.md) | Risk from head commit age vs adapter-hydrated timestamps. |
| [Mutators](guides/mutators.md) | Multiplicative bumps after weighted criteria (`junior_author`, `critical_service`). |
| [Declarative rules](guides/declarative-rules.md) | Extra weighted `labels_any` rules in config. |
| [Trusted plugins](guides/trusted-plugins.md) | Base-ref YAML plugin files merged into the score. |
| [Contextual evidence](guides/contextual-evidence.md) | Author familiarity and blast radius; head checkout before the Action. |

## Reference

Tables and schema-shaped docs for precise contracts.

| Page | Description |
| --- | --- |
| [Programmatic use (npm)](programmatic-use.md) | `@usebrindle/merge-risk-core`, `PlatformAdapter`, and base-ref security for custom runners. |
| [GitHub Action inputs](reference/action-inputs.md) | Inputs from `extensions/github-action/action.yml`. |
| [Criteria (built-ins)](reference/criteria.md) | The eight built-in `criteria` ids and what they measure. |
| [Config JSON Schema](reference/config-schema.md) | Field reference mirroring `schema/merge-risk-config.schema.json`. |

## Concepts

| Page | Description |
| --- | --- |
| [Scoring](concepts/scoring.md) | End-to-end pipeline: criteria, weights, self-disable, mutators, tiers. |

## Design history

- [Architecture Decision Records](adrs/) — why behind accepted decisions.
- [Design documents index](designs/README.md) — LLD map including contextual evidence.
- [Low-level design](designs/lld-merge-risk-classifier.md) — how the shipped layout maps to the engine and adapters.

---

**Contributors:** internal dogfooding pointers live in [CONTRIBUTING.md](../CONTRIBUTING.md#dogfooding) (links back here and to the LLD snapshot).
