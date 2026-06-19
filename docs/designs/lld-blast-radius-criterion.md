# Blast radius criterion

## Purpose

Given a pull request's changed files and a **unified reverse-dependency graph** of the repository, produce per-file findings that explain how broadly each changed file is depended upon. This is Peter's second contextual evidence item: a one-line change to a shared schema or auth helper is riskier than an isolated UI tweak.

In Brindle this becomes:

1. Pure **`analyzeBlastRadius`** in `core/contextual/` (lift from demo — language-blind)
2. Built-in criterion **`blast_radius`**
3. Blast Radius section in **Contextual evidence** PR comment

**Language-specific parsing is not in this LLD.** Extractors build the graph ([lld-dependency-graph-extractors.md](lld-dependency-graph-extractors.md)). This LLD covers graph semantics, analyzer, criterion, and aggregation.

## What it computes

Per changed file that has an enabled extractor:

- **`directDependentCount`** — one-hop importers (supporting evidence)
- **`directDependents`** — sample of direct importer paths (actionable names)
- **`transitiveReachCount`** — unique ancestors in reverse graph, excluding self (**primary characterization signal**)
- **`characterization`** — `isolated`, `moderate`, or `broad` from transitive reach

### Why transitive reach

Direct-only undercounts deep tree embedding:

```
LoginInput.tsx  ←  LoginForm.tsx  ←  Header.tsx  ←  50 page modules
```

| Signal | Count | Characterization |
| --- | --- | --- |
| Direct dependents | 1 | isolated (misleading) |
| Transitive reach | 52 | broad (matches intuition) |

Characterization thresholds (default, tunable):

| Transitive reach | Characterization |
| --- | --- |
| 0–2 | isolated |
| 3–10 | moderate |
| 11+ | broad |

Direct count remains in findings and report when it diverges from transitive reach.

## Pure analyzer contract

Lift from [`v2/evidence-demo/src/analyzers/blastRadius.ts`](../../../v2/evidence-demo/src/analyzers/blastRadius.ts):

```typescript
// core/contextual/blastRadius.ts (conceptual)

import type { ReverseDependencyGraph } from "./extractors/types.js";

export type BlastRadiusCharacterization = "isolated" | "moderate" | "broad";

export interface BlastRadiusFinding {
  changedFile: string;
  directDependentCount: number;
  directDependents: readonly string[];
  transitiveReachCount: number;
  characterization: BlastRadiusCharacterization;
}

export interface BlastRadiusInput {
  changedFiles: readonly string[];
  graph: ReverseDependencyGraph;
  /** Optional override; defaults below */
  thresholds?: {
    isolatedMax: number;   // default 2
    moderateMax: number;   // default 10
  };
}

export function countDirectImportersForFile(
  changedFile: string,
  graph: ReverseDependencyGraph,
): { dependentCount: number; dependents: readonly string[] };

export function countTransitiveReachForFile(
  changedFile: string,
  graph: ReverseDependencyGraph,
): { transitiveReachCount: number };

export function characterizeBlastRadius(
  transitiveReachCount: number,
  thresholds?: BlastRadiusInput["thresholds"],
): BlastRadiusCharacterization;

export function analyzeBlastRadius(input: BlastRadiusInput): BlastRadiusFinding[];
```

Algorithm: BFS/DFS upward on reverse graph; visited set for cycles; no language-specific logic.

### Analyzable changed files

A changed file is analyzed when:

- An extractor is registered for its extension **and**
- The extractor id is in `enabled_extractors` (or default v1 set)

Otherwise hydration records it in `notAnalyzedForBlastRadius` with reason — see extractors LLD.

## Criterion: `blast_radius`

YAML key: **`blast_radius`**

### Options

| Option | Default | Description |
| --- | --- | --- |
| `aggregation` | `max` | Combine per-file scores (only `max` in v1) |
| `characterization_scores` | see below | Map reach tier → raw 0–100 |
| `enabled_extractors` | `["js_ts", "stylesheet"]` | Subset of registry ids to run |
| `thresholds` | isolated ≤2, moderate ≤10 | Override blast characterization cut points |

Default `characterization_scores`:

```yaml
characterization_scores:
  isolated: 20
  moderate: 55
  broad: 90
```

### Evaluation

1. Read `contextualEvidence.blastRadiusFindings` and `notAnalyzedForBlastRadius` from `PRContext`
2. If **no** analyzable changed files produced findings (all unsupported extensions) → **`selfDisable: true`** (like `test_coverage` without coverage)
3. Map each finding's `characterization` → score
4. Aggregate **`max`**
5. Return `CriterionResult`:
   - `justification`: e.g. "Broadest reach: 52 files transitively on `src/schema.ts` (see Contextual evidence)"
   - `detail`: `{ worstFile, worstCharacterization, transitiveReach, findings, notAnalyzed }`

## PRContext fields

```typescript
contextualEvidence?: {
  familiarityFindings: FamiliarityFinding[];
  blastRadiusFindings: BlastRadiusFinding[];
  notAnalyzedForBlastRadius: readonly {
    path: string;
    reason: string;  // e.g. "no extractor for extension .go", "extractor disabled: go"
  }[];
  enabledExtractors: readonly string[];
  limitations: readonly string[];  // git + per-extractor
};
```

Graph itself may be omitted from `PRContext` after hydration (findings only) to keep context small — implementation choice. Findings must be reproducible from graph if retained for tests.

## Limitations (report)

Merged from enabled extractors plus global blast-radius lines ([lld-contextual-evidence-reporting.md](lld-contextual-evidence-reporting.md)):

- Transitive reach follows **static** edges only; dynamic requires, runtime wiring, platform includes excluded
- Counts are a **lower bound** when wiring is not expressed as static imports
- Path aliases: root tsconfig/jsconfig only (js_ts/stylesheet extractors)
- Per-language exclusions from extractors LLD (Go macros, Python dynamic import, etc.)

When direct and transitive counts diverge, report shows both. When equal, collapse to one number.

## Sort order for report

Blast-radius findings: characterization tier (broad first), transitive reach descending, direct count, path.

## Testing strategy

- Pure unit tests on `analyzeBlastRadius` with in-memory graphs (cycles, deep chain, cross-language edges)
- Criterion tests with fixture `PRContext` containing pre-built findings
- Integration: hydration + graph on fixture repos per extractor

## Dependencies

- [lld-dependency-graph-extractors.md](lld-dependency-graph-extractors.md) — graph construction
- [lld-contextual-evidence-reporting.md](lld-contextual-evidence-reporting.md) — rendering
- v2 demo [`blastRadius.ts`](../../../v2/evidence-demo/src/analyzers/blastRadius.ts) — algorithm reference (port verbatim)

## Module layout (target)

```
core/contextual/
  blastRadius.ts
  blastRadius.types.ts
core/criteria/
  authorFamiliarity.ts          # separate file
  authorFamiliarity.types.ts
  blastRadius.ts
  blastRadius.types.ts
```

Criteria modules call no git and no parsers — they read hydrated findings on `PRContext` only (ADR 0004). Alternatively, criteria invoke pure analyzers inside `evaluate` if findings are not pre-computed; **preferred:** hydrate once, share findings between criterion and report to avoid duplicate work. LLD preference: **hydrate findings in adapter, criteria read `contextualEvidence`**.
