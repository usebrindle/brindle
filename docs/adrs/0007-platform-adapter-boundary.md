# 7. Platform adapter boundary and multi-platform sequencing

Date 2026-05-31

## Status

Accepted

## Context

The early framing treated this as a GitHub Action, and that framing began to dictate the architecture. GitLab and Bitbucket teams are a real market. The funded competitors are mostly GitHub-only, and that is cited as their biggest limitation, which is an opening rather than a reason to copy them.

If the scoring engine is coupled to GitHub, then supporting GitLab or Bitbucket later means a rewrite. If the platform-specific work is isolated behind one interface, then each new platform is a new adapter rather than a new product.

ADR 0004 already did most of this work without naming it. Criteria are pure functions over a hydrated context and never touch any platform client. So the core is already platform-agnostic. The platform-specific work is confined to three seams. Fetching pull request data to build the context, writing the result back, and enabling auto-merge.

The platforms diverge in ways that are not cosmetic. They have different execution models. GitHub has Actions referenced with `uses`. GitLab has CI components included with `include: component`. Bitbucket has Pipes referenced as Docker images. They also differ on auto-merge. GitHub has native auto-merge and GitLab has merge-when-pipeline-succeeds, which is close in spirit. Bitbucket's native auto-merge story is weaker.

## Decision

Introduce a `PlatformAdapter` interface that isolates all platform-specific behavior. The scoring engine, criteria, mutators, config schema, and coverage adapters never depend on any platform.

```
interface PlatformAdapter {
  buildContext(): Promise<PRContext>;
  writeResult(result: ScoreResult): Promise<void>;
  enableAutoMerge(method: MergeMethod): Promise<AutoMergeOutcome>;
}
```

Implementations are `GitHubAdapter`, `GitLabAdapter`, and `BitbucketAdapter`. The core compiles to one runtime-agnostic artifact. Each platform gets a thin native wrapper around that artifact in its own packaging format.

Sequencing. GitHub first, for the fastest adoption and the freshest case study. GitLab second, because GitLab teams are underserved by the funded competitors and GitLab's merge model maps cleanly onto the auto-merge design. Bitbucket third, because its install model and weaker auto-merge make it the highest effort for the smallest reachable audience.

## Consequences

Positive. The core is written once and never changes across platforms. A new platform is a new adapter plus a new wrapper.

Positive. Designing the seam now is cheap. Retrofitting it after the core is coupled to GitHub would be expensive.

Positive. The platform-agnostic core strengthens the hosted dashboard, since a team running GitHub and GitLab in different divisions gets one view across both.

Negative. The adapter boundary adds an indirection that a GitHub-only tool would not need. This is accepted as the cost of portability.

Negative. Auto-merge may not have a clean equivalent on Bitbucket. Auto-merge is likely a GitHub and GitLab feature in practice, with Bitbucket offering scoring and reporting only. This is known now rather than discovered later.

Negative. Three packaging formats mean more release surface than a single ncc bundle. Mitigated by keeping the core as one artifact and the wrappers thin.
