# Contextual evidence reporting

## Purpose

Assemble familiarity and blast-radius findings into human-readable **Contextual evidence** content inside the platform-neutral `RiskReport`. The merge-risk **tier and score remain authoritative**; evidence explains *why* signals fired without issuing a second verdict.

This lifts the validated report shape from [`v2/evidence-demo/src/report/`](../../../v2/evidence-demo/src/report/) into [`core/report.ts`](../../core/report.ts) and related pure formatters. There is **no CLI** in the product path.

Peter's acceptance test: a senior engineer reads the evidence and says "yes, that is actually why this PR is or is not risky." Copy tuning from [`VALIDATION.md`](../../../v2/evidence-demo/VALIDATION.md) is the baseline.

## Integration with RiskReport

Extend [`buildRiskReport`](../../core/report.ts):

1. Existing verdict heading + next-step sentence (unchanged)
2. Collapsible **Score breakdown** `<details>` (unchanged)
3. **New:** collapsible **Contextual evidence** `<details>` when `contextualEvidence` present on scored context or passed into report builder
4. Footer marker + "Scored by Brindle" (unchanged)

```typescript
// core/report.types.ts — extend BuildRiskReportOptions (conceptual)

export interface BuildRiskReportOptions {
  // existing auto-merge, fail-on-high, informational…
  contextualEvidence?: ContextualEvidencePayload;
}

export interface ContextualEvidencePayload {
  authorLogin: string;
  changeNumber: number;
  changedFiles: readonly string[];
  familiarity: readonly FamiliarityFinding[];
  blastRadius: readonly BlastRadiusFinding[];
  notAnalyzedForBlastRadius: readonly { path: string; reason: string }[];
  limitations: readonly string[];
  enabledExtractors: readonly string[];
}
```

The GitHub adapter passes `contextualEvidence` from hydrated `PRContext` when either contextual criterion was enabled for the run.

**Do not** produce a separate risk score or merge recommendation in the evidence block.

## Report structure (markdown)

```markdown
<details>
<summary>Contextual evidence</summary>

Changed files (N):
  path/to/a.ts
  …

### Familiarity
How familiar the author was with each changed file **before this PR** (last N days).

`src/legacy.ts` — none
  Author owned 0% of lines and 0% of line churn in 6 months before this PR (no author commits in window; 42 commits by others in window).

`src/newFeature.ts` — high
  File added in this PR; no prior history on this path. Author is the sole contributor in this change.

### Blast radius
Static dependency reach for changed source files (transitive reach characterizes breadth).

`src/schema.ts` — broad
  Reach: 52 files transitively (1 direct importer), including `src/LoginForm.tsx`.

### Not analyzed for blast radius
  docs/README.md — no extractor for extension .md

### Limitations
- …

</details>
```

## Familiarity copy rules

### Modified files — line-first when blameable lines exist

> Author owned 62% of lines and 41% of line churn in 6 months before this PR (3 commits, last touch 10 days ago; 7 commits by others in window).

When blameable lines are zero (binary, empty, generated-only): commit-only phrasing with "commit activity" for commit-share, not line ownership.

### No author history (modified)

> Author owned 0% of lines and 0% of line churn in 6 months before this PR (no author commits in window; N commits by others in window).

### Greenfield (added)

> File added in this PR; no prior history on this path. Author is the sole contributor in this change.

Do **not** lead with "0% lines before this PR" on adds.

### Sole contributor (modified, pre-PR)

> Author owned 100% of lines in 6 months before this PR (2 commits, last touch today).

### Labels and sorting

- Full changed file path per line (not parent directory)
- Repository root path `.` → `(repository root)`
- Sort: `none` → `moderate` → `high` (highest risk first), then path

## Blast radius copy rules

### Headline number

Lead with **transitive reach**. Show direct count when informative:

- Divergent: `Reach: 52 files transitively (1 direct importer), including `src/LoginForm.tsx`.`
- Equal (including zero): `Depended on by N file(s), including …`

Use **"files"** not **"modules"** when findings mix languages (JS/TS + stylesheets + Go, etc.).

### Sort

Broad → moderate → isolated; then transitive reach descending; direct count; path.

### Section context line

One line under header: static dependency reach; transitive reach characterizes breadth; see Limitations for exclusions.

## Limitations block

Merge static lists from:

1. **Familiarity** — merge-base measurement; PR commits excluded; greenfield high by change kind; rename misclassification; git robustness rows from [familiarity LLD](lld-author-familiarity-criterion.md)
2. **Global blast radius** — static edges only; lower bound caveat for platform wiring
3. **Per enabled extractor** — from [extractors LLD](lld-dependency-graph-extractors.md) (js_ts, stylesheet, go, …)

Remove demo limitation: "No risk score or merge recommendation" (product **does** score — evidence supplements it).

Example familiarity bullets:

- Familiarity uses `git blame` and `git log` at **merge-base**; commits and line changes in this PR are excluded
- Files **added** in this PR are characterized **high** (greenfield) by change kind, not pre-PR git stats
- Git history and blame do not account for renames, squashes, co-authored commits, or bot attribution
- Commit-share is reported separately and is not a substitute for line ownership

Example blast-radius bullets (js_ts + stylesheet v1):

- Transitive reach follows static import/require/stylesheet at-rule chains; dynamic require and runtime indirection excluded
- Stylesheet: HTML `<link>`, CSS-in-JS, built-in `sass:*`, package imports without root path config excluded
- Path aliases from root `tsconfig.json` / `jsconfig.json` only

## Pure formatters (module layout)

```
core/contextual/report/
  buildContextualEvidencePayload.ts   # findings → ContextualEvidencePayload
  formatFamiliarityDetail.ts          # one finding → detail string
  formatBlastRadiusDetail.ts
  renderContextualEvidenceMarkdown.ts # payload → markdown block (no <details> wrapper)
core/report.ts                        # wraps in <details>, appends to comment
```

Port logic from [`renderReport.ts`](../../../v2/evidence-demo/src/report/renderReport.ts) and [`buildEvidenceReport.ts`](../../../v2/evidence-demo/src/report/buildEvidenceReport.ts) with pre-PR and greenfield adjustments.

## Criteria table integration

Optional: truncate worst-file summary into criterion **Notes** column from `CriterionResult.justification` (already specified in criterion LLDs). Full per-file detail lives only in Contextual evidence `<details>` to avoid comment noise.

## Check Run body

GitHub adapter may include abbreviated contextual evidence in Check Run output (implementation choice). Minimum: tier + score breakdown. Full evidence in PR comment when `post-comment` enabled.

## Testing

- Unit: `formatFamiliarityDetail` — modified pre-PR, greenfield, no history, sole contributor
- Unit: `formatBlastRadiusDetail` — divergent vs equal counts
- Unit: `renderContextualEvidenceMarkdown` — sort order, limitations merge, not-analyzed list
- Snapshot: full `buildMergeRiskCommentMarkdown` with contextual block

Regression cases from VALIDATION.md (zod #6098 unfamiliar, citty dependency-only not-analyzed).

## Dependencies

- [lld-author-familiarity-criterion.md](lld-author-familiarity-criterion.md) — finding shape, copy inputs
- [lld-blast-radius-criterion.md](lld-blast-radius-criterion.md) — finding shape
- [lld-dependency-graph-extractors.md](lld-dependency-graph-extractors.md) — per-extractor limitations
- [`core/report.ts`](../../core/report.ts) — existing comment structure
