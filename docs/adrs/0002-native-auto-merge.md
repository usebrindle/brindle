# 2. Enable GitHub native auto-merge rather than calling the merge API

Date 2026-05-31

## Status

Accepted

## Context

A risk score that cannot trigger an action is just a dashboard. The product's payoff is letting low-risk pull requests merge without a human, which is the behavior that originally motivated the tool. So the Action needs a way to act on a LOW verdict.

There are two ways to make a pull request merge from inside an Action. Call the merge REST endpoint directly when the score is low. Or enable GitHub's native auto-merge feature and let GitHub perform the merge once its own conditions are met.

Calling the merge endpoint directly means the Action becomes responsible for checking that CI is green, that required approvals are present, and that branch protection is satisfied, then handling merge races and retries. It also means the Action is the actor that performed the merge, which makes it the thing that could bypass a protection rule if its logic were wrong.

## Decision

The Action enables GitHub native auto-merge on the pull request when the tier is at or below the configured `auto_merge.tier`. It never calls the merge endpoint itself.

The auto-merge module makes one decision and one mutation. If auto-merge is disabled in config, do nothing. If the tier is riskier than the configured tier, do nothing. Otherwise call the `enablePullRequestAutoMerge` mutation with the configured method, and step away.

GitHub then waits for required checks, required approvals, and branch protection before merging, and refuses to merge if any required check goes red.

## Consequences

Positive. Branch protection, required checks, and required approvals all still apply. The Action can never be the thing that bypassed a gate. This is central to the trust model and complements ADR 0001.

Positive. The module is tiny. No check polling, no approval waiting, no merge-race handling, no retry logic. All of that is GitHub's responsibility.

Positive. A clean separation of concerns. The Action is the judgment layer. GitHub is the enforcement layer.

Negative. The Action depends on the repo having auto-merge allowed in settings. When it is not allowed, the mutation errors and the Action logs a clear message and continues without enabling. The team must turn the setting on themselves.

Negative. A team that runs auto-merge with no required checks and no branch protection is trusting the score alone. This is a knowing choice and the docs flag it, but the Action cannot prevent it.
