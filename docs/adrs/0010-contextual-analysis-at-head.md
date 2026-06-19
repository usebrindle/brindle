# 10. Contextual analysis at pull request head

Date 2026-06-18

## Status

Accepted

## Context

Brindle's security model ([ADR 0001](0001-no-pr-head-execution.md)) forbids executing or interpreting **configuration, plugins, or arbitrary code** from the pull request head. Config, declarative rules, and trusted plugins load from the **base branch** only.

Contextual evidence criteria — **author familiarity** (git blame and log) and **blast radius** (static dependency graph) — require reading **repository source** and **git object data** at the PR head commit (`headSha`) or at the merge-base derived from it. Without this, familiarity cannot attribute line ownership and blast radius cannot see import/require/stylesheet edges in the code under review.

There is tension with [ADR 0005](0005-read-findings-not-run-tools.md), which says the Action should read CI output rather than run external analysis tools. Git history and static parsing are not linter or test reruns; they are **Brindle-owned analysis** with no duplicate signal in typical CI.

Teams need a clear rule: what head-ref access is permitted without reopening the fork PR RCE surface from ADR 0001.

## Decision

The Action and adapters may perform **read-only contextual analysis** at `headSha` and merge-base commits when contextual criteria are enabled in base-branch config.

Permitted:

- **Git read commands** against a checked-out clone: `git blame`, `git log`, `git diff`, `git merge-base`, `git cat-file`, `git ls-files` — no checkout of executable scripts for evaluation, no running repo build/test tooling
- **Reading source file text** at head for static dependency extraction (parsers in Brindle core/extractors)
- **Fetching head-ref blobs** via platform APIs when equivalent to read-only file access (same class as reading Istanbul coverage from head per existing coverage hydration)

Still forbidden (ADR 0001 unchanged):

- Loading `.merge-risk.yml`, declarative rules, trusted plugins, or custom scripts from the PR head
- `eval`, dynamic import, or execution of any file from the PR head
- Using PR-head content to alter scoring config or criterion weights

Config gating: contextual hydration runs only when `criteria.author_familiarity` and/or `criteria.blast_radius` is enabled in base-branch YAML (same pattern as optional coverage fetch).

Consumer workflows must include a **read-only checkout** of the PR head (documented in contextual evidence LLDs). Shallow clone depth is an operator tradeoff for blame accuracy.

## Consequences

Positive. Contextual criteria are implementable without violating the base-ref config rule or running untrusted code from the PR.

Positive. The distinction is auditable: "read source for static analysis" vs "execute head content."

Positive. ADR 0005 scope remains intact for linters, typecheckers, and test runners — teams still own those in CI; Brindle does not rerun them.

Negative. Workflows gain a checkout step and clone time; large monorepos pay I/O cost during hydration.

Negative. Context building grows more complex (author email resolution, merge-base, extractor registry).

Negative. Future features that want head-ref **execution** still require a new ADR or an explicit supersession of ADR 0001 — this ADR does not broaden that class.

## Notes

See [lld-contextual-evidence-overview.md](../designs/lld-contextual-evidence-overview.md) for hydration architecture and workflow examples.

Cross-reference when reviewing PRs: reading `package.json` from head **for static import graph resolution** is permitted; using scripts defined in head `package.json` is not.
