# 9. Service criticality criterion: MVP config contract

Date 2026-06-04

## Status

Accepted

## Context

Merge-risk needs a built-in criterion that raises risk when a change request touches paths belonging to **logical services** (for example payments or auth), using only base-branch configuration. The high-level design lists `core/criteria/serviceCriticality.ts` and a forward-compatible top-level `services` catalog but does not define YAML shapes or scoring rules.

Criteria must stay pure over `PRContext` (ADR 0004). Service membership must therefore be computed from **repository-relative paths** already present on `PRContext.files` plus **base-branch** YAML loaded into config (ADR 0001). No head ref execution.

## Decision

### Top-level `services`

Optional mapping: **service id** (string key) → `{ globs: string[] }` with at least one non-empty glob per service. Globs are repository-relative micromatch patterns, consistent with `file_patterns`. This catalog defines **which paths belong to which service**. It carries no numeric score so the same catalog can be reused later (for example by a `critical_service` mutator) without duplicating risk numbers.

### Criterion id and options

The YAML criterion key is **`service_criticality`** (snake_case, like `diff_size` and `file_patterns`).

Under `criteria.service_criticality.options` the MVP shape is:

- **`aggregation`**: string enum, only **`max`** in MVP. When multiple services are touched, the raw criterion score is the maximum of the per-service scores listed below.
- **`scores`**: mapping from **service id** → number **0–100** (raw risk when that service is touched). Keys are not required to appear under `services` at JSON Schema validation time; stricter cross-checks may be added later.
- **`default_score`** (optional): number **0–100** when no configured service matches any changed path. When omitted, the built-in treats this as **0** at evaluation time (slice 2).

An **empty** `options: {}` object is valid (same ergonomics as `file_patterns`) so config can ship the criterion id before options are filled in.

JSON Schema validates `services` when present, validates `criteria.service_criticality.options` when that criterion is listed (same conditional pattern as `file_patterns`), and rejects unknown option keys so typos fail fast.

### Non-goals (this ADR)

- Registering the criterion in `builtins.ts` (separate wiring slice).
- The `critical_service` mutator.

## Implementation notes (slice 2)

Runtime scoring lives in `core/criteria/serviceCriticality.ts`. The scorer merges root `services` onto the options object passed to `evaluate` for id `service_criticality` only, so validated YAML keeps `services` at the document root (ADR 0001).

## Consequences

Positive. Teams can document service boundaries once and attach numeric risk in one criterion block.

Positive. Schema and TypeScript types give a single source of truth for the MVP contract before runtime code ships.

Negative. JSON Schema cannot enforce that every `scores` key exists under `services`; misconfiguration may only surface at runtime or in team review until a stricter validator exists.

Negative. Service overlap (one path matching multiple services) is defined only in the criterion implementation (slice 2); this ADR only fixes aggregation policy (`max`).
