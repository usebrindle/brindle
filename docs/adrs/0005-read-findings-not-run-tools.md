# 5. Read CI findings rather than running tools

Date 2026-05-31

## Status

Accepted

## Context

Several risk signals come from tools that already run in a team's CI pipeline. Test coverage, linters such as ESLint and Stylelint, type checkers, and security scanners. There is a recurring temptation to have the Action run these tools itself so it can read their output.

Running a tool inside the Action means owning that tool's config resolution, its plugin graph, its version and language runtime quirks, and its performance. For linters specifically, it also duplicates work, because the team's CI already runs the linter and already makes it a required check that GitHub auto-merge gates on.

## Decision

The Action does not run external analysis tools. It reads the output those tools already produce in the team's CI.

Coverage is read from a report file the team's existing test step writes. The Action parses that file through a format adapter and scores it.

Linters and type checkers are out of scope entirely. They already run in CI as required checks, so GitHub native auto-merge will not merge until they pass. Reading their output would re-derive a signal that is already enforced upstream.

The general rule. The thing that makes a change risky is what a tool found, not that the Action ran the tool. Read the findings, score them, stay out of the execution business.

## Consequences

Positive. The Action stays language-agnostic at its core. It ingests reports rather than running ecosystem-specific toolchains.

Positive. No duplicated work and no second source of truth for results a team's CI already produces.

Positive. A whole class of future "should we just run X" requests is answered once by this ADR.

Negative. The team must configure their CI to emit the report files the Action reads, such as a coverage summary. This is a small setup step documented in the README.

Negative. The Action cannot score a signal that the team's CI does not already produce. If a team wants a check that is not in their pipeline, they add it to their pipeline rather than to the Action.
