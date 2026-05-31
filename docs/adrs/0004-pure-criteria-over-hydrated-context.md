# 4. Criteria are pure functions over a hydrated context

Date 2026-05-31

## Status

Accepted

## Context

The scoring engine runs a set of criteria over a pull request. Each criterion produces a score and a justification. There are two ways to structure this. Each criterion fetches the data it needs on its own, making its own API calls and reading its own files. Or all data is fetched once up front into a context object, and criteria are pure functions that read from it.

An early draft implied criteria would do their own I/O, including one criterion reading a coverage artifact directly. That approach makes criteria slow, hard to test, order-dependent, and prone to duplicated API calls when several criteria need the same PR data.

## Decision

All I/O happens once, in context building, before any scoring. The result is an immutable `PRContext` carrying PR metadata, changed files, totals, and parsed coverage. Criteria receive this context and their own config options, and return a result synchronously. Criteria perform no network access, no filesystem access, and read no clock.

The `PRContext` carries data, never the Octokit client, so a criterion cannot make an API call even by accident.

## Consequences

Positive. Criteria are trivially testable. A unit test constructs a fixture context and asserts the score. No mocking of network or filesystem is required.

Positive. Criteria are parallel-safe and order-independent, since they share no mutable state and touch no external resource.

Positive. PR data is fetched once. Several criteria reading changed files do not each pay an API round trip.

Positive. The scoring engine is deterministic. The same context and config always produce the same result, which is essential for an auditable merge decision.

Negative. Context building must anticipate everything any criterion might need. Adding a criterion that needs new data means extending context building, not just dropping in a self-contained module.

Negative. Data that turns out to be expensive to fetch is paid for even when the criterion that needs it is disabled. This is mitigated by gating optional fetches, such as coverage, on whether the relevant criterion is enabled.
