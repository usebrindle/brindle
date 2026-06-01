# GitHub Action extension

JavaScript Action (`node20`) that runs Brindle on `pull_request` events: loads **`.merge-risk.yml` from the pull request base ref** (ADR 0001), builds `PRContext` via `GitHubAdapter`, scores with `score()`, publishes with `writeResult()` (Check Run + optional comment).

## Layout

| Path | Purpose |
| --- | --- |
| `action.yml` | Action metadata and inputs |
| `index.ts` | Runner entry (top-level `await`) |
| `runMergeRiskGithubAction.ts` | Fetch base config → score → write results |
| `dist/` | **`ncc` bundle** (committed). Rebuild after changing sources. |

## Rebuild `dist/`

From the repository root:

```bash
npm run build:github-action
```

CI runs the same command and **`git diff --exit-code extensions/github-action/dist`** so the committed bundle cannot drift from sources.

## Consumer workflow

Minimal permissions for check + comment (native auto-merge is slice 09 and needs extra scopes):

```yaml
permissions:
  contents: read
  checks: write
  pull-requests: write
```

Use `uses: ./extensions/github-action` (path) or, once published, `uses: usebrindle/brindle/path/to/action@vX`.

## First-time enablement

The Contents API reads config from the **base** ref of the pull request. If `.merge-risk.yml` is not yet on the default branch, the merge-risk job fails until that file exists on `main` (for example merge a config-only change first, or expect one red run on the introducing PR).
