# 8. Packaging, distribution, and the open-core boundary

Date 2026-05-31

## Status

Accepted

## Context

Three packaging questions were unresolved. How users install the tool, whether it is a node module, and what is open versus proprietary.

SonarQube runs a server that ingests code, analyzes it, and reports back to the version control platform. That architecture exists because their analysis is heavy and stateful. This tool's scoring is lightweight, deterministic, and runs in milliseconds on data the platform already provides, so it does not need a server for the core scoring path.

The open source argument for this product is specifically about the scoring logic. A team letting the tool gate their merges wants to see how the score is computed. That part must be open or the trust wedge disappears. But the trust requirement attaches only to the scoring path, not to everything.

## Decision

### Distribution

The primary distribution per platform is the native CI extension. A GitHub Action referenced with `uses`, a GitLab CI component included with `include: component`, and a Bitbucket Pipe. The user adds a small pipeline configuration and the platform pulls the extension. There is no server in the loop for the free tier, and the customer's code never reaches our infrastructure, which is a selling point for security-conscious teams.

### Module structure

The scoring engine is built as a standalone, platform-agnostic module internally. The CI extensions wrap it. Publishing that engine to a package registry such as npm is an option held for later, for people who want to embed scoring in their own tooling. It is not a commitment now. The pure structure from ADR 0004 makes this fall out naturally.

### Open-core boundary

Open, because trust requires it. The scoring engine, the built-in criteria, the weight math, the mutators, the security model, the config schema, and the platform adapter interface. Anyone can read exactly how a risk tier is computed. This is the CI extension that runs in the customer's own pipeline.

Closed, because it is the business and openness adds nothing to trust. The hosted dashboard, cross-repo analytics, auto-merge-rate history, centralized config management, audit export, and team management. None of this needs to be open for the merge decision to be trusted, because the merge decision is made by the open engine. Most of it is closed simply by living on a hosted service rather than in the customer's pipeline.

Optionally proprietary inside the free tier. A set of advanced or pre-tuned criteria may be offered only through the paid tier, while the engine and criterion interface stay open. This mirrors the SonarQube model where core analyzers are open and advanced analyzers are commercial. It provides proprietary value without compromising the trust wedge.

## Consequences

Positive. The free tier is trustworthy because the scoring path is fully open and runs in the customer's own environment.

Positive. The paid tier is naturally defensible because it lives on a hosted service the customer cannot self-host trivially, and because it aggregates across repos and platforms in ways the in-pipeline extension cannot.

Positive. The worry about exposing the whole codebase is resolved by recognizing the paid product never lived in the extension. It lives in the hosted service, which is closed by nature.

Negative. Two codebases to maintain over time. The open core and the closed hosted service. Accepted as the standard cost of the open-core model.

Negative. The deferred decision on publishing the engine to npm leaves a small ambiguity in module boundaries that must be kept clean so the option stays open.

Negative. An optionally-proprietary criteria set inside the free tier risks community friction if the line between free and paid criteria feels arbitrary. The line must be drawn on genuine sophistication, not on hobbling the free tier.
