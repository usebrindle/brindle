# 6. TypeScript over plain JavaScript

Date 2026-05-31

## Status

Accepted

## Context

The project is a Node.js GitHub Action. The initial preference was plain Node.js for simplicity and to avoid a compile step. TypeScript adds a build step and a learning surface for contributors who do not use it.

Two facts pull the other way. The Action is already bundled with ncc, so a build step exists regardless of language choice. And the criterion interface is a public contract that third parties implement when they write trusted plugins, where a wrong shape should be caught at author time rather than at runtime in someone's CI.

## Decision

The project is written in TypeScript. The criterion, mutator, context, and config types are defined explicitly and exported. The ncc build compiles and bundles from the TypeScript entry point into the committed `dist/`.

## Consequences

Positive. The criterion interface that outside contributors implement is type-checked. Mistakes surface at author time with editor support rather than at runtime.

Positive. The config and context shapes are self-documenting through their types, which doubles as design documentation.

Positive. The marginal cost over plain JavaScript is small, since ncc already imposes a build step.

Negative. Contributors who do not know TypeScript face a slightly higher barrier. Mitigated by the fact that most of the Action ecosystem uses TypeScript, so the audience largely expects it.

Negative. Two build tools in the chain, the TypeScript compiler for type checking and ncc for bundling, rather than one. The `typecheck` and `build` scripts keep these separable and clear.

## Notes

This decision was explicitly questioned during design. If a future contributor proposes reverting to plain JavaScript with JSDoc typedefs, that is a defensible position that would supersede this ADR, with the tradeoff being that the public criterion contract loses compile-time enforcement and shifts to runtime validation.
