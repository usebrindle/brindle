# Author familiarity criterion

## Purpose

Given a pull request's changed files and the repo's git history, produce per-file findings that explain how familiar the **author was with each path before this PR**. This is Peter's first contextual evidence item: a senior backend engineer touching a frontend file they have never worked in is higher risk than a mid-level engineer changing code they owned for months.

In Brindle this becomes:

1. A pure **`analyzeFamiliarity`** function in `core/contextual/`
2. A built-in criterion **`author_familiarity`** registered in `core/criteria/builtins.ts`
3. Detailed lines in the **Contextual evidence** PR comment section

The analyzer is **language-agnostic** (git does not care about file type). It complements [`author_seniority`](../../core/criteria/authorSeniority.ts) (team-configured login tier); it does not replace it.

## Product corrections vs v2 demo

The demo measured familiarity at **PR head**, which inflates first-touch of legacy files to `moderate`. **Product spec requires:**

| Correction | Requirement |
| --- | --- |
| **Merge-base measurement** | All signals at `baseRevision` (merge-base); exclude commits and line changes in `base..head` |
| **Greenfield gate** | `changeKind: added` → characterization `high` with dedicated copy |
| **Tightened moderate rule** | Remove `(last touch ≤ 120 days AND authorCommitCount ≥ 1)` path |
| **Pre-PR report copy** | "owned … **before this PR**", not "current lines at head" |

Source: [`v2/tasks/prd-pre-pr-familiarity.md`](../../../v2/tasks/prd-pre-pr-familiarity.md), [`v2/tasks/prd-greenfield-familiarity.md`](../../../v2/tasks/prd-greenfield-familiarity.md).

## What it computes

For the PR author and each changed file, derive three classes of signals at **`baseRevision`**.

### Line-level signals (primary ownership)

**Pre-PR content ownership** (snapshot at `baseRevision`)

- `git blame <baseRevision> -- <path>`
- Count blameable lines: non-empty physical lines (blank excluded; comment-only counts for v1)
- `authorOwnedLineCount`, `totalBlameableLineCount`, `shareOfCurrentContent`

Answers: *"Of the code in this file before this PR, how much was attributable to this author?"*

**Windowed line churn** (within history window, still at `baseRevision`)

- `git blame --since=<windowStart> <baseRevision> -- <path>`
- `authorChangedLineCount`, `totalChangedLineCount`, `shareOfWindowedLineChurn`

Answers: *"Of the line-level churn on this file in the window before this PR, how much did this author write?"*

### Commit signals (activity and recency)

From `git log --since=<windowStart> <baseRevision> -- <path>`:

- `authorCommitCount`, `totalFileCommitCount`, `lastTouchDate`
- `shareOfFileCommitChurn` — commit-share, **not** line ownership

### Change kind

Each changed file carries:

```typescript
type FileChangeKind = "added" | "modified";
```

Detection (hydration):

- Primary: `git diff --diff-filter=A --name-only base...head`
- Fallback: path absent at `baseRevision` (`git cat-file -e baseRevision:path` fails) → `added`
- Otherwise → `modified`

### Characterization

Per-file: `high`, `moderate`, or `none`, plus all supporting numbers.

**Greenfield gate (before combined rule):**

- If `changeKind === "added"` → **`high`** immediately; pre-PR signals remain zero; do not lead report with "0% lines before this PR"

**Recency gate:** Stale context cannot yield `high`. Recency from commit `lastTouchDate` at merge-base.

**Combined rule** (modified files only; default thresholds — tunable via criterion options):

| Tier | Rule |
| --- | --- |
| **none** | `authorCommitCount === 0` OR `lastTouchDate === null` OR last touch > 180 days OR (last touch > 120 days AND `authorCommitCount === 1`) |
| **high** | last touch ≤ 60 days AND any of: `shareOfCurrentContent ≥ 0.25` OR `shareOfWindowedLineChurn ≥ 0.25` OR `authorCommitCount ≥ 3` |
| **moderate** | not none, not high, AND any of: (last touch ≤ 120 days AND `authorCommitCount ≥ 2`) OR (last touch 121–180 days AND `authorCommitCount ≥ 2`) OR (`shareOfCurrentContent ≥ 0.10` OR `shareOfWindowedLineChurn ≥ 0.10`) with last touch ≤ 120 days |
| **fallback** | else `none` |

**Removed from demo:** `(last touch ≤ 120 days AND authorCommitCount ≥ 1)` moderate path.

## Robustness table (v1 intended behavior)

Each row is **specified** for product v1 — not deferred. Where v1 is partial, limitations text must say so honestly.

| Scenario | v1 behavior | Limitation / report note |
| --- | --- | --- |
| **Renamed files** | History does not follow renames without `-M`/`-C`; blame may attribute to wrong author | State: renames not tracked; counts may mis-attribute |
| **Squash merges** | Squashed commit appears as single author; prior line history collapsed | State: squash merges distort ownership |
| **Co-authored-by** | Git author on commit may not match co-author trailer | State: co-authors not reflected in blame |
| **Bot commits** | Bot email counted if it matches author email resolution | Teams may map bot logins in author email config |
| **Generated / minified** | Blame runs but may mislead; binary → zero blameable lines | Fall back to commit-only phrasing |
| **Rename as add+delete** | May classify as `added` → greenfield `high` | State: renames may misclassify add/delete pairs |
| **Reviewers who don't commit** | Invisible to git history | Inherent limitation of commit/blame signals |
| **New team members** | Zero history → `none` on modified files | Distinct from greenfield `high` on adds |

Future v2 may add `-M`/`-C`, co-author parsing, or rename detection — document as enhancement, not v1 promise.

## Pure analyzer contract

```typescript
// core/contextual/familiarity.ts (conceptual)

export interface ChangedFileEntry {
  path: string;
  changeKind: FileChangeKind;
}

export interface GitHistoryQuery {
  authorEmail: string;
  path: string;
  since: Date;
  revision: string;  // baseRevision — stop point
}

export interface GitHistoryStats {
  authorCommitCount: number;
  totalFileCommitCount: number;
  lastTouchDate: Date | null;
}

export interface GitHistorySource {
  query(query: GitHistoryQuery): GitHistoryStats;
}

export interface GitBlameQuery {
  path: string;
  authorEmail: string;
  since: Date;
  revision: string;  // baseRevision
}

export interface GitBlameStats {
  authorOwnedLineCount: number;
  totalBlameableLineCount: number;
  authorChangedLineCount: number;
  totalChangedLineCount: number;
}

export interface GitBlameSource {
  query(query: GitBlameQuery): GitBlameStats;
}

export interface FamiliarityFinding {
  touchedFile: string;
  changeKind: FileChangeKind;
  authorOwnedLineCount: number;
  totalBlameableLineCount: number;
  shareOfCurrentContent: number;
  authorChangedLineCount: number;
  totalChangedLineCount: number;
  shareOfWindowedLineChurn: number;
  authorCommitCount: number;
  totalFileCommitCount: number;
  lastTouchDate: Date | null;
  shareOfFileCommitChurn: number;
  characterization: "high" | "moderate" | "none";
}

export interface FamiliarityInput {
  authorEmails: readonly string[];  // query uses any matching email
  changedFiles: readonly ChangedFileEntry[];
  historySource: GitHistorySource;
  blameSource: GitBlameSource;
  baseRevision: string;
  historyWindowDays: number;  // default 180
  classifiedAt: Date;         // from PRContext.classifiedAtIso — no Date.now() in analyzer
}

export function analyzeFamiliarity(input: FamiliarityInput): FamiliarityFinding[];
```

For **`added`** files: skip git queries (or query and ignore); apply greenfield gate.

Impure **`createGitHistorySource`** / **`createGitBlameSource`** live at hydration edge ([overview](lld-contextual-evidence-overview.md)).

## Criterion: `author_familiarity`

YAML key: **`author_familiarity`**

### Options

| Option | Default | Description |
| --- | --- | --- |
| `history_window_days` | `180` | Git history window for commits and windowed line churn |
| `aggregation` | `max` | How to combine per-file characterizations into one raw score (only `max` in v1) |
| `characterization_scores` | see below | Map tier → raw 0–100 (higher = riskier) |

Default `characterization_scores`:

```yaml
characterization_scores:
  high: 15
  moderate: 50
  none: 85
```

### Evaluation

1. Read pre-computed `contextualEvidence.familiarityFindings` from `PRContext` (hydrated before score)
2. If no changed files → raw **0**, justification "No changed files"
3. Map each finding's `characterization` → score via `characterization_scores`
4. Aggregate with **`max`** (worst file wins — same as `file_patterns`)
5. Return `CriterionResult` with:
   - `score`: aggregated raw
   - `justification`: e.g. "Lowest familiarity: none on `src/auth.ts` (see Contextual evidence)"
   - `detail`: `{ worstFile, worstCharacterization, findingCount, findings: [...] }` for report/table

**Self-disable:** Never self-disables when enabled and files exist. Empty PR file list → score 0, not self-disable.

### Author email resolution (hydration)

`PRContext.author` is GitHub login. Hydration resolves `authorEmails`:

1. Email on head commit from git or GitHub commit API
2. GitHub noreply patterns for login (`id+login@users.noreply.github.com`, etc.)
3. Optional config: `criteria.author_familiarity.options.author_emails: string[]` override/addition

Familiarity git queries match any resolved email.

## PRContext fields

Hydration populates (when criterion enabled):

```typescript
interface PRContext {
  // existing…
  baseRevision?: string;
  authorEmails?: readonly string[];
  contextualEvidence?: {
    familiarityFindings: FamiliarityFinding[];
    // blast radius fields — see other LLDs
    limitations: readonly string[];
  };
}
```

`baseRevision` is merge-base between PR base and head (platform-neutral concept; GitHub adapter computes via git).

## Relationship to `author_seniority`

| | `author_seniority` | `author_familiarity` |
| --- | --- | --- |
| Input | Login rules in config | Git history at merge-base |
| Question | "What tier is this person on the team?" | "How much has this person worked on these files?" |
| Example | Junior login → higher raw | First touch of legacy file → higher raw |

Both may be enabled with independent weights.

## Report notes

See [lld-contextual-evidence-reporting.md](lld-contextual-evidence-reporting.md). Lead with line facts for **modified** files; greenfield copy for **added**. Sort by characterization tier (`none` first = highest risk display priority), then path.

## Dependencies

- [lld-contextual-evidence-overview.md](lld-contextual-evidence-overview.md) — hydration, ADR 0010
- [lld-contextual-evidence-reporting.md](lld-contextual-evidence-reporting.md) — copy
- [ADR 0004](../adrs/0004-pure-criteria-over-hydrated-context.md) — pure over context
- v2 demo [`familiarity.ts`](../../../v2/evidence-demo/src/analyzers/familiarity.ts) — line math reference; **do not** copy head-revision or moderate-rule semantics
