# 3. Use Check Runs rather than commit statuses

Date 2026-05-31

## Status

Accepted

## Context

The Action reports a risk tier of LOW, MEDIUM, or HIGH back to the pull request, and teams want to use that result as a branch-protection gate. GitHub offers two mechanisms for reporting a pass or fail style result on a commit. The Commit Statuses API and the Check Runs API.

Commit statuses support only four states. `success`, `failure`, `pending`, and `error`. There is no neutral state. This forces an awkward mapping for a three-tier risk signal. A MEDIUM or a non-blocking HIGH would have to be reported as `success`, which is semantically wrong and undermines using the result as a gate.

Check Runs support a richer set of conclusions, including `neutral` and `action_required` alongside `success` and `failure`. They also carry a structured output body that renders in the Checks tab.

## Decision

The Action reports via the Check Runs API.

Tier maps to conclusion as follows. LOW maps to `success`. MEDIUM maps to `neutral`. HIGH maps to `action_required` by default, or to `failure` when `fail-on-high` is true so it blocks merge under branch protection.

The bundled GitHub Action adds an **informational check** mode (`informational_check_conclusion`, default **true**): every tier maps to check conclusion `success` while the verdict and score breakdown still appear in the check body and PR comment. That keeps required checks and the Actions job green when merge risk is advisory only. Set `informational_check_conclusion` to **false** (and optionally `fail_on_high: true`) to restore strict ADR conclusions for branch-protection gates.

The full per-criterion breakdown table is written into the Check Run output so it is visible even when PR comments are disabled.

## Consequences

Positive. The three-tier signal maps cleanly onto distinct conclusions. A MEDIUM result is honestly neutral rather than a misleading success when strict mapping is enabled.

Positive. Teams get a real branch-protection gate by requiring the check, turning **informational** mode off, and setting `fail-on-high` when they want HIGH to map to `failure`.

Positive. The breakdown lives in the Checks tab regardless of comment settings, which keeps the audit trail intact.

Negative. Check Runs require the `checks: write` permission, which the consumer workflow must grant.

Negative. Check Runs are slightly more involved to create than a one-call commit status. The richer result is worth the small added complexity.
