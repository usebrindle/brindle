# 1. The Action never executes PR-head content

Date 2026-05-31

## Status

Accepted

## Context

The Action runs inside CI on pull request events and needs write access to post comments, write Check Runs, and enable auto-merge. Pull requests from forks are authored by people outside the repo. GitHub Actions has a well-documented history of supply chain attacks where a fork pull request, combined with a workflow holding write permissions and secrets, leads to remote code execution and secret exfiltration. The `pull_request_target` trigger is the most abused primitive here, because it grants the workflow base-repo privileges while the code under test is attacker-controlled.

The product is a merge-safety tool. A remote code execution hole in a tool whose entire purpose is making merges safer would be disqualifying. Trust is the thing being sold.

An earlier design draft loaded custom criteria as JavaScript imported dynamically from the pull request and executed it in the runner. That recreates the exact attack vector above.

## Decision

The Action never runs, evaluates, interprets, or `eval`s anything that originates from the pull request head. Every input the Action acts on comes from the base branch or from the published Action itself.

Concretely.

Configuration in `.merge-risk.yml` is read from the base branch ref, never the checked-out PR workspace.

Declarative custom rules are evaluated by a fixed interpreter that supports only a small allowed set of operations. No arbitrary code runs.

Trusted plugins are loaded only via the Contents API at the base ref. The loader rejects any path that resolves outside the configured plugin directory. They are opt-in per path.

The auto-merge decision is computed from base-branch config and deterministic scoring, never from PR-head content.

## Consequences

Positive. A fork pull request cannot inject code, alter scoring, or change its own risk verdict. The most dangerous class of GitHub Actions vulnerability is structurally impossible.

Positive. The constraint is simple to state and to review. Any proposed feature can be checked against one rule.

Negative. Genuinely dynamic per-repo custom logic is harder. Teams cannot drop an arbitrary script in the PR and have it scored on that same PR. The declarative rules and base-branch trusted-plugin paths cover the real use cases, at the cost of some flexibility.

Negative. Reading config and plugins from the base ref rather than the workspace adds API calls and a small amount of complexity to context building.

## Notes

Any future contribution that proposes executing or interpreting PR-head content, however convenient, violates this ADR and must be rejected or must supersede this ADR with an explicit new decision.
