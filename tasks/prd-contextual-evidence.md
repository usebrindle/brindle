    # PRD: Contextual Evidence in Brindle Core

## Introduction

Lift the validated v2 evidence demo into Brindle as first-class product capability: two new weighted criteria (**`author_familiarity`**, **`blast_radius`**) plus a **Contextual evidence** section in merge-risk PR comments. Per changed file, Brindle explains how familiar the author was with that path **before this PR** and how broadly the file is statically depended upon.

The v2 demo proved the explanation shape on real pull requests ([`v2/evidence-demo/VALIDATION.md`](../../v2/evidence-demo/VALIDATION.md)). The demo CLI is **discarded**. Pure analyzers, pluggable dependency extractors, and report formatters move into `@usebrindle/merge-risk-core` and the GitHub Action.

**Product spec supersedes demo semantics** where they differ: merge-base familiarity (not PR head), greenfield gate for added files, tightened moderate rule, pluggable multi-language extractors, and indented `.sass` support.

**Source designs:**

- [docs/designs/README.md](../docs/designs/README.md)
- [lld-contextual-evidence-overview.md](../docs/designs/lld-contextual-evidence-overview.md)
- [lld-author-familiarity-criterion.md](../docs/designs/lld-author-familiarity-criterion.md)
- [lld-dependency-graph-extractors.md](../docs/designs/lld-dependency-graph-extractors.md)
- [lld-blast-radius-criterion.md](../docs/designs/lld-blast-radius-criterion.md)
- [lld-contextual-evidence-reporting.md](../docs/designs/lld-contextual-evidence-reporting.md)
- [ADR 0010](../docs/adrs/0010-contextual-analysis-at-head.md)

**Reference implementation (not product contract for familiarity semantics):** [`v2/evidence-demo/src/`](../../v2/evidence-demo/src/)

## Goals

- Ship **`author_familiarity`** and **`blast_radius`** as weighted built-in criteria (raw 0–100, configurable weights) in `.merge-risk.yml`
- Hydrate git history/blame at **merge-base** and a unified reverse-dependency graph at PR head via read-only checkout ([ADR 0010](../docs/adrs/0010-contextual-analysis-at-head.md))
- Append a collapsible **Contextual evidence** block to PR comment markdown with validated copy (pre-PR framing, greenfield adds, transitive reach headline)
- Implement **`DependencyExtractor`** port with v1 **`js_ts`** and **`stylesheet`** extractors (refactor from demo monolith)
- Gate hydration when contextual criteria are enabled (same pattern as coverage)
- Extend JSON Schema for new criterion options
- Dogfood both criteria on this repository's pull requests
- Specify v2 extractor slots (`go`, `python`, `rust`) in registry; implement in follow-on slices
- **Maintain at least 80% test coverage** on `core/` and `adapters/` after every story (`npm run test:coverage`, thresholds in `vitest.config.ts`)

## Testing and coverage (every story)

In addition to story-specific acceptance criteria below, **each user story (US-001–US-024) is not done until:**

- [ ] `npm run test` passes
- [ ] `npm run test:coverage` passes with **≥80%** lines, statements, branches, and functions (enforced by `vitest.config.ts` thresholds on `core/**/*.ts` and `adapters/**/*.ts`)
- [ ] `npm run typecheck` passes

New code in `core/contextual/`, criteria, and GitHub hydration must include tests that keep project coverage at or above these thresholds. Do not merge a story that drops coverage below 80%.

## User Stories

### Phase 1 — Core scaffolding and types

### US-001: Contextual module scaffolding
**Description:** As a developer, I need a `core/contextual/` module tree so analyzers, extractors, and report formatters have a clear home.

**Acceptance Criteria:**
- [ ] Directories exist: `core/contextual/`, `core/contextual/extractors/`, `core/contextual/report/`
- [ ] Types exported from `core/index.ts` (or contextual barrel) without breaking existing public API
- [ ] `npm run typecheck` passes

### US-002: Extend PRContext and contextual evidence types
**Description:** As a developer, I need platform-neutral types for contextual findings on `PRContext` so criteria and reporting share one contract.

**Acceptance Criteria:**
- [ ] `PRContext` extended with optional `baseRevision`, `authorEmails`, `contextualEvidence`
- [ ] `ContextualEvidenceSnapshot` includes `familiarityFindings`, `blastRadiusFindings`, `notAnalyzedForBlastRadius` (path + reason), `limitations`, `enabledExtractors`
- [ ] `FamiliarityFinding` includes `changeKind: 'added' | 'modified'` and all signal fields per familiarity LLD
- [ ] `BlastRadiusFinding` matches blast-radius LLD contract
- [ ] Unit tests for type guards/serializers if needed
- [ ] `npm run typecheck` passes

---

### Phase 2 — Dependency extractor port (v1)

### US-003: Dependency extractor port and graph merge
**Description:** As a developer, I need a language-agnostic extractor interface and reverse-graph builder so blast radius scales beyond JS/TS.

**Acceptance Criteria:**
- [ ] `DependencyEdge`, `DependencyExtractor`, `ExtractorContext`, `ReverseDependencyGraph` in `core/contextual/extractors/types.ts`
- [ ] Pure `buildReverseDependencyGraph(edges)` builds `Map<target, importers[]>`
- [ ] Unit tests: single edge, cycle terminates without double-count, cross-language chain
- [ ] `npm run typecheck` and `npm run test` pass

### US-004: Extractor registry
**Description:** As a developer, I need a registry to look up extractors by id and file extension.

**Acceptance Criteria:**
- [ ] `ExtractorRegistry` with `getById`, `getForFile`, `builtIns`
- [ ] `DEFAULT_V1_EXTRACTOR_IDS = ['js_ts', 'stylesheet']`
- [ ] Unknown extension returns `undefined` from `getForFile`
- [ ] Unit tests for lookup
- [ ] `npm run typecheck` and `npm run test` pass

### US-005: js_ts extractor
**Description:** As a developer, I need a JS/TS extractor so static import and literal require edges feed the unified graph.

**Acceptance Criteria:**
- [ ] `jsTsExtractor` implements `DependencyExtractor` with id `js_ts`
- [ ] Extensions: `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts`
- [ ] Extracts ESM static imports and static-literal `require()` per extractors LLD
- [ ] Resolves relative specifiers and root `tsconfig.json`/`jsconfig.json` `paths`/`baseUrl`
- [ ] Fixture tests: relative import, path alias, require mixed with import, dynamic require excluded
- [ ] Behavior matches or exceeds demo `importGraphSource.ts` for JS/TS
- [ ] `npm run typecheck` and `npm run test` pass

### US-006: stylesheet extractor (including indented .sass)
**Description:** As a developer, I need a stylesheet extractor so CSS/SCSS/Sass dependencies and JS→CSS cross-language edges are in the unified graph.

**Acceptance Criteria:**
- [ ] `stylesheetExtractor` implements `DependencyExtractor` with id `stylesheet`
- [ ] Extensions: `.css`, `.scss`, `.sass`
- [ ] Parses `@import`, `@use`, `@forward` (quoted) and `@import url('…')`
- [ ] **Indented `.sass`** parsed via `postcss-sass` or equivalent (demo gap closed)
- [ ] Sass partial/index resolution (`_tokens.scss`, `index.scss`)
- [ ] Built-in `sass:*` modules produce no graph edge
- [ ] Fixture tests: CSS import chain, SCSS `@use`/`@forward`, partial resolution, JS imports CSS module
- [ ] `npm run typecheck` and `npm run test` pass

### US-007: Dependency graph hydration orchestration
**Description:** As a developer, I need impure graph hydration that walks the repo and dispatches to enabled extractors.

**Acceptance Criteria:**
- [ ] `hydrateDependencyGraph` (adapter or extension module) walks tracked files via `git ls-files`
- [ ] Dispatches to extractors in `enabledExtractorIds`; merges edges; returns graph + limitations
- [ ] Changed files with no enabled extractor recorded in `notAnalyzedForBlastRadius` with explicit reason
- [ ] Integration test on small fixture repo with JS + SCSS chain
- [ ] `npm run typecheck` and `npm run test` pass

---

### Phase 3 — Familiarity (product semantics)

### US-008: Git history and blame sources at merge-base
**Description:** As a developer, I need git-backed sources that stop at merge-base so PR commits do not inflate familiarity.

**Acceptance Criteria:**
- [ ] `GitHistorySource.query` accepts `revision` (baseRevision); uses `git log --since=… <revision> -- <path>`
- [ ] `GitBlameSource.query` uses `git blame <revision>` and `git blame --since=… <revision>`
- [ ] Integration tests: commit on PR branch after merge-base does **not** increment author commit count
- [ ] `npm run typecheck` and `npm run test` pass

### US-009: Resolve merge-base, change kind, and author emails
**Description:** As a developer, I need hydration to compute baseRevision, added vs modified paths, and author emails for familiarity queries.

**Acceptance Criteria:**
- [ ] `baseRevision` = merge-base between PR base and head (git)
- [ ] `changeKind` via `git diff --diff-filter=A` with fallback `git cat-file -e baseRevision:path`
- [ ] `authorEmails` from head commit email + GitHub noreply patterns for `PRContext.author` login
- [ ] Optional config override: `criteria.author_familiarity.options.author_emails`
- [ ] Unit/integration tests: one added + one modified file in same PR
- [ ] `npm run typecheck` and `npm run test` pass

### US-010: analyzeFamiliarity with merge-base and greenfield gate
**Description:** As a senior engineer, I want familiarity measured before this PR so first-touch of legacy files is not inflated.

**Acceptance Criteria:**
- [ ] Pure `analyzeFamiliarity` in `core/contextual/familiarity.ts`
- [ ] All git queries use `baseRevision`; PR commits excluded
- [ ] `changeKind === 'added'` → characterization **`high`** before combined rule; skip git queries optional
- [ ] Tightened moderate rule: **no** `(last touch ≤ 120 days AND authorCommitCount ≥ 1)` path
- [ ] Unit test: 1 pre-PR commit, 90 days ago, 0% lines → **`none`** (not moderate)
- [ ] Unit test: first-touch legacy (0 pre-PR commits, modified) → **`none`**
- [ ] Unit test: added file → **`high`**
- [ ] Unit test: pre-PR single-rewrite (high line share) → **`high`**
- [ ] `npm run typecheck` and `npm run test` pass

### US-011: author_familiarity criterion
**Description:** As a team admin, I want to weight author familiarity in merge-risk scoring.

**Acceptance Criteria:**
- [ ] `author_familiarity` registered in `core/criteria/builtins.ts`
- [ ] Reads `contextualEvidence.familiarityFindings` from `PRContext`
- [ ] Maps characterization → raw score via `characterization_scores` (defaults: high 15, moderate 50, none 85)
- [ ] Aggregates with **`max`** (worst file wins)
- [ ] Returns justification pointing to Contextual evidence section
- [ ] Unit tests with fixture contexts
- [ ] `npm run typecheck` and `npm run test` pass

---

### Phase 4 — Blast radius analyzer and criterion

### US-012: analyzeBlastRadius (port from demo)
**Description:** As a developer, I need a language-blind blast-radius analyzer over the unified reverse graph.

**Acceptance Criteria:**
- [ ] Pure `analyzeBlastRadius` in `core/contextual/blastRadius.ts`
- [ ] Direct dependent count + sample; transitive reach via BFS/DFS with cycle handling
- [ ] Characterization from transitive reach (defaults: 0–2 isolated, 3–10 moderate, 11+ broad)
- [ ] Port algorithm from demo; unit tests include deep chain (direct 1, transitive N+2 → broad)
- [ ] `npm run typecheck` and `npm run test` pass

### US-013: End-to-end blast radius hydration + findings
**Description:** As a developer, I need the GitHub hydration path to produce blast-radius findings on changed analyzable files.

**Acceptance Criteria:**
- [ ] When `blast_radius` enabled, hydration runs graph build + `analyzeBlastRadius` on changed paths
- [ ] Findings attached to `PRContext.contextualEvidence`
- [ ] `selfDisable` path: all changed files unsupported → criterion self-disables
- [ ] Integration test: changed `.ts` file with known dependents in fixture repo
- [ ] `npm run typecheck` and `npm run test` pass

### US-014: blast_radius criterion
**Description:** As a team admin, I want to weight static blast radius in merge-risk scoring.

**Acceptance Criteria:**
- [ ] `blast_radius` registered in `core/criteria/builtins.ts`
- [ ] Options: `characterization_scores`, `aggregation: max`, `enabled_extractors`, `thresholds`
- [ ] Self-disables when no analyzable changed files
- [ ] Unit tests with fixture contexts
- [ ] `npm run typecheck` and `npm run test` pass

---

### Phase 5 — Reporting and config

### US-015: Contextual evidence markdown formatters
**Description:** As a senior engineer reading a PR comment, I want evidence with numbers and honest limitations, not a second verdict.

**Acceptance Criteria:**
- [ ] `formatFamiliarityDetail`: pre-PR copy for modified; greenfield copy for added
- [ ] `formatBlastRadiusDetail`: transitive reach headline; "files" not "modules" when mixed
- [ ] `renderContextualEvidenceMarkdown`: sorted sections, changed-file list, limitations, not-analyzed list
- [ ] Path `.` renders as `(repository root)`
- [ ] Unit tests cover VALIDATION.md scenarios (unfamiliar external contributor, greenfield add)
- [ ] `npm run typecheck` and `npm run test` pass

### US-016: Integrate Contextual evidence into RiskReport
**Description:** As a user, I want contextual evidence in the existing Brindle PR comment below the score breakdown.

**Acceptance Criteria:**
- [ ] `buildMergeRiskCommentMarkdown` appends collapsible `<details><summary>Contextual evidence</summary>…` when payload present
- [ ] Verdict heading and score breakdown unchanged; no second merge recommendation in evidence block
- [ ] `BuildRiskReportOptions` accepts `contextualEvidence` payload
- [ ] Snapshot test for full comment with contextual block
- [ ] `npm run typecheck` and `npm run test` pass

### US-017: JSON Schema for contextual criteria options
**Description:** As a team admin, I want invalid contextual criterion config rejected at validate time.

**Acceptance Criteria:**
- [ ] `schema/merge-risk-config.schema.json` validates `criteria.author_familiarity.options` when present (`history_window_days`, `characterization_scores`, `aggregation`, optional `author_emails`)
- [ ] Schema validates `criteria.blast_radius.options` when present (`characterization_scores`, `enabled_extractors`, `thresholds`, `aggregation`)
- [ ] Config tests for valid and invalid examples
- [ ] `npm run typecheck` and `npm run test` pass

---

### Phase 6 — GitHub Action integration and dogfood

### US-018: Gate contextual hydration in GitHubAdapter
**Description:** As an operator, I only want git/graph I/O when contextual criteria are enabled in base-branch config.

**Acceptance Criteria:**
- [ ] `buildContext` checks enabled criteria ids before git blame/log and graph walk
- [ ] No checkout-dependent I/O when neither `author_familiarity` nor `blast_radius` enabled
- [ ] Findings hydrated once; shared by scorer and report builder
- [ ] Adapter test with mocked git/workspace fixtures
- [ ] `npm run typecheck` and `npm run test` pass

### US-019: Document workflow checkout requirement
**Description:** As a consumer, I need clear docs for the read-only head checkout step.

**Acceptance Criteria:**
- [ ] New guide or section: `docs/guides/contextual-evidence.md` (or equivalent)
- [ ] Example workflow with `actions/checkout@v4` at `github.event.pull_request.head.sha`, `fetch-depth` guidance
- [ ] Links from `docs/reference/criteria.md` for new criterion ids
- [ ] `docs/README.md` hub links the guide

### US-020: Dogfood contextual criteria on Brindle repo
**Description:** As the Brindle team, we want our own PRs scored with familiarity and blast radius before release.

**Acceptance Criteria:**
- [ ] `.merge-risk.yml` enables `author_familiarity` and `blast_radius` with reasonable weights
- [ ] GitHub workflow updated with head checkout before Action step
- [ ] Dogfood PR shows Contextual evidence section with plausible familiarity and blast-radius lines
- [ ] `npm run typecheck` and `npm run test` pass

### US-021: Action integration test with contextual criteria
**Description:** As a developer, I need an end-to-end test that contextual hydration runs on a fixture PR event.

**Acceptance Criteria:**
- [ ] Integration test: fixture payload + temp git repo → scorer produces breakdown rows for both criteria
- [ ] Comment markdown includes Contextual evidence `<details>` when criteria enabled
- [ ] `npm run typecheck` and `npm run test` pass

---

### Phase 7 — v2 language extractors (follow-on slices)

### US-022: go extractor
**Description:** As a developer on a Go repo, I want blast radius to follow static Go import edges.

**Acceptance Criteria:**
- [ ] `goExtractor` registered in registry; resolves `import "path"` with `go.mod` module path
- [ ] Fixture tests for internal package import chain
- [ ] Limitation strings documented per extractors LLD
- [ ] `npm run typecheck` and `npm run test` pass

### US-023: python extractor
**Description:** As a developer on a Python repo, I want blast radius to follow static import/from edges.

**Acceptance Criteria:**
- [ ] `pythonExtractor` for `.py`/`.pyi`; literal imports only
- [ ] Fixture tests; dynamic import excluded
- [ ] `npm run typecheck` and `npm run test` pass

### US-024: rust extractor
**Description:** As a developer on a Rust repo, I want blast radius to follow static mod/use edges.

**Acceptance Criteria:**
- [ ] `rustExtractor` for `.rs`; `mod`/`use` resolution to `foo.rs` / `foo/mod.rs`
- [ ] Fixture tests; macro-generated modules excluded in limitations
- [ ] `npm run typecheck` and `npm run test` pass

---

## Functional Requirements

### Architecture and hydration

- FR-1: All contextual I/O must occur during adapter/extension context build, before scoring (ADR 0004)
- FR-2: Config and plugins must load from base ref only (ADR 0001); source/git read at head permitted (ADR 0010)
- FR-3: Hydration must run only when `author_familiarity` and/or `blast_radius` is enabled in base-branch config
- FR-4: Consumer GitHub workflows must checkout PR head (read-only) before the Brindle Action when contextual criteria are enabled
- FR-5: Findings must be hydrated once on `PRContext.contextualEvidence` and reused by criteria and report

### Familiarity

- FR-6: Familiarity signals must be computed at **`baseRevision`** (merge-base); commits and line changes in `base..head` excluded
- FR-7: Each changed file must have `changeKind: 'added' | 'modified'`
- FR-8: **`added`** files must characterize as **`high`** (greenfield gate) without leading report copy showing "0% lines before this PR"
- FR-9: **`modified`** files use combined rule per familiarity LLD (tightened moderate rule; no single-commit moderate path)
- FR-10: Familiarity analyzer must be pure; git shell-out only in hydration modules
- FR-11: `author_familiarity` criterion must map characterizations to raw scores with default **`max`** aggregation
- FR-12: Author git queries must use resolved **`authorEmails`**; criterion justification cites GitHub login

### Blast radius

- FR-13: Dependency edges must flow through pluggable **`DependencyExtractor`** implementations into one **`ReverseDependencyGraph`**
- FR-14: v1 must ship **`js_ts`** and **`stylesheet`** extractors; registry must support adding **`go`**, **`python`**, **`rust`**
- FR-15: Stylesheet extractor must parse indented **`.sass`** (product requirement; demo gap)
- FR-16: `analyzeBlastRadius` must be language-blind; transitive reach is primary characterization signal
- FR-17: Changed files without an enabled extractor must appear in **`notAnalyzedForBlastRadius`** with reason — not silent zero reach
- FR-18: `blast_radius` criterion must self-disable when no analyzable changed files; otherwise **`max`** aggregate

### Reporting

- FR-19: PR comment must include collapsible **Contextual evidence** with Familiarity, Blast radius, Not analyzed, and Limitations sections
- FR-20: Familiarity copy must use **"before this PR"** framing for modified files
- FR-21: Blast-radius copy must lead with transitive reach; use **"files"** when mixed language findings
- FR-22: Evidence block must not issue a separate merge verdict or recommendation

### Config

- FR-23: JSON Schema must validate new criterion options when those criteria keys are present
- FR-24: Default characterization scores: familiarity `{ high: 15, moderate: 50, none: 85 }`; blast radius `{ isolated: 20, moderate: 55, broad: 90 }`

## Non-Goals

- v2 evidence demo CLI (discarded; no maintenance)
- The other three Peter evidence items: public-interface touches, clean-merge resemblance, revert/incident resemblance
- Weighted reach (PageRank, entry-point detection)
- GitLab/Bitbucket contextual hydration in v1 (GitHub first; ports stay platform-neutral)
- Running external linters, typecheckers, or test tools inside Brindle (ADR 0005)
- Renames tracking (`git blame -M/-C`) in v1 — document as limitation, do not silently claim accuracy
- v2 language extractors (`go`, `python`, `rust`) are **specified** in LLDs but **out of v1 ship scope** unless US-022–024 are explicitly scheduled

## Design Considerations

- **Seniority vs familiarity:** `author_seniority` (login tier) and `author_familiarity` (file history) are complementary; both may be enabled
- **Report trust:** Show numbers, name direct dependents, state limitations — validated in demo US-015 equivalent
- **Demo → product:** Port blast-radius traversal and line-signal math from demo; **do not** port PR-head familiarity semantics
- **Registry pattern:** Same spirit as coverage format adapter — scorer stays dumb, parsers at edge

## Technical Considerations

- **Dependencies:** v1 extractors likely need `typescript` (compiler API), `postcss`, `postcss-scss`, `postcss-sass` (or equivalent) — evaluate bundle size for ncc GitHub Action dist
- **Performance:** Full-repo `git ls-files` walk acceptable for v1; document monorepo caveat
- **Security:** No execution of PR-head scripts or config; static read + git read only (ADR 0010)
- **Merge-risk-core:** Pure modules under `core/contextual/` publishable with package
- **Testing:** Pure unit tests for analyzers/extractors; adapter integration tests with fixture repos; no live GitHub in unit tests
- **Coverage gate:** `npm run test:coverage` must pass after every story; Vitest thresholds are 80% for lines, statements, branches, and functions (`vitest.config.ts`). Extend `coverage.include` when adding new source under `core/contextual/` or `adapters/github/contextual/`

## Success Metrics

- Enabling both criteria on a real PR produces a Contextual evidence section a senior engineer accepts as actionable (same bar as demo validation)
- First-touch of legacy file (external contributor) shows familiarity **`none`**, not **`moderate`**
- Added file in PR shows familiarity **`high`** with greenfield copy
- Changed shared TS module shows transitive reach > direct count when deep import chain exists
- Scoring breakdown includes both criteria rows when enabled; weights affect final tier
- Dogfood PR on Brindle repo exercises full path in CI
- Project coverage stays at or above **80%** on included `core/` and `adapters/` sources through US-021 (v1 ship)

## Open Questions

- Minimum acceptable **`fetch-depth`** for shallow clones vs full history for 180-day window?
- Should **`contextualEvidence`** appear in Check Run body or comment-only for v1?
- Bundle size budget for postcss + TS compiler API in committed Action dist?
- Ship v2 extractors (`go`, `python`, `rust`) as separate PRD milestones or extend this PRD when v1 ships?

## Implementation Order

1. US-001 – US-002 (scaffolding, types)
2. US-003 – US-007 (extractor port, v1 extractors, graph hydration)
3. US-008 – US-011 (familiarity hydration + analyzer + criterion)
4. US-012 – US-014 (blast radius analyzer + criterion)
5. US-015 – US-017 (reporting + schema)
6. US-018 – US-021 (GitHub integration + dogfood)
7. US-022 – US-024 (v2 extractors, optional follow-on)
