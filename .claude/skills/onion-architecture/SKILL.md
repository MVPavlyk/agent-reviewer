---
name: onion-architecture
description: "Forces Onion Architecture dependency direction in this repo's backend packages (server/, reviewer-core/): domain and application logic stay framework-free at the center, Fastify/Drizzle/HTTP/external clients stay at the rim as swappable adapters behind interfaces, and all coupling points inward. Use when adding a module, writing a service.ts/repository.ts, deciding whether a Fastify or Drizzle type may appear in business logic, wiring a new adapter into platform/container.ts, or reviewing whether a change leaks infrastructure into the domain. Does not cover Fastify route/plugin mechanics (see fastify-best-practices), Drizzle schema/query syntax (see drizzle-orm-patterns), where React/Next.js code lives (see frontend-architecture), or import specifier hygiene like alias-vs-relative-path or barrel routing (see import-hygiene)."
metadata:
  tags: architecture, backend, onion-architecture, clean-architecture, ports-and-adapters, dependency-inversion, fastify, drizzle, server, reviewer-core
---

## When to use

Use this skill when you:
- Add a new module under `server/src/modules/<name>/` or grow an existing one
- Write or review a `service.ts`, `repository.ts`, or anything called "domain"
  logic in `server/` or `reviewer-core/`
- Decide whether a Fastify request/reply type, a Drizzle row/query type, or an
  Octokit/LLM SDK type is allowed to appear in a given function
- Wire a new adapter into `server/src/platform/container.ts`
- Are asked to review a backend diff for architectural drift, not correctness

This skill does **not** apply to `client/` (see [frontend-architecture](../frontend-architecture/SKILL.md))
and does not restate Fastify or Drizzle mechanics — see the "Scope boundary"
note in [SOURCES.md](SOURCES.md).

## TL;DR

```
        ┌─────────────────────────────────────┐
        │ Infrastructure (rim)                 │  Fastify routes, Drizzle
        │  routes.ts · repository.ts · adapters │  repositories, Octokit,
        │  ┌─────────────────────────────────┐  │  LLM SDKs, DI container
        │  │ Application (use cases)          │  │
        │  │  service.ts                       │  │
        │  │  ┌─────────────────────────────┐  │  │
        │  │  │ Domain (core)                 │ │  │
        │  │  │  business rules, pure types   │ │  │
        │  │  └─────────────────────────────┘  │  │
        │  └─────────────────────────────────┘  │
        └─────────────────────────────────────┘
```

**One rule, mechanically checkable:** an import graph edge may only point
from an outer ring to an inner ring, never the reverse. `domain` imports
nothing from this repo except `@devdigest/shared` *types*. `application`
imports `domain` and **interfaces**, never concrete adapters. `infrastructure`
implements the interfaces and is the only ring allowed to import Fastify,
Drizzle, Octokit, or an LLM SDK.

This is applied **inside each vertical slice** (`modules/<name>/`), not as a
repo-wide horizontal folder split — see
[rules/vertical-slices.md](rules/vertical-slices.md) for why, this repo
already organizes by feature and that stays.

## Gold-standard example already in this repo

[`reviewer-core/`](../../../reviewer-core/CLAUDE.md) is the reference
implementation — read it before writing new domain code elsewhere:
- `review/run.ts`, `review/reduce.ts` — pure orchestration and business rules,
  zero Fastify/Drizzle imports.
- `llm/openrouter.ts` — an adapter behind an `LLMProvider` interface the core
  depends on, never the other way round.

`server/src/platform/container.ts` is the composition root: the one place
concrete adapters (`OctokitGitHubClient`, `OpenAIProvider`, …) get bound to
the interfaces application code depends on. `ContainerOverrides` is how tests
swap in mocks without touching application code — this is Onion's
testability payoff, already working, just not yet named or enforced outside
`reviewer-core`.

## How to use

- [rules/layers.md](rules/layers.md) — the four rings, this repo's file-to-ring
  mapping, and what's allowed to import what
- [rules/dependency-direction.md](rules/dependency-direction.md) — the single
  enforceable rule with concrete violation examples from this codebase's shape
- [rules/ports-and-di.md](rules/ports-and-di.md) — interface-first adapters,
  `container.ts` as composition root, testing via `ContainerOverrides`
- [rules/vertical-slices.md](rules/vertical-slices.md) — reconciling Onion
  rings with this repo's module-per-Fastify-plugin convention
- [rules/cross-module-boundaries.md](rules/cross-module-boundaries.md) — the
  same dependency-direction rule applied sideways: a module reaching into a
  sibling module's `repository.ts` instead of its `service.ts`
- [rules/port-ownership.md](rules/port-ownership.md) — *where* a port
  interface is declared, not just whether one exists; a service can be
  fully constructor-injected and still depend on an adapter's file for its
  own contract's shape
- [rules/enforcement.md](rules/enforcement.md) — wiring `dependency-cruiser`
  (already a `server/` dependency) to lint the rule in CI, not just by review
- [examples.md](examples.md) — before/after diffs

## Core principles

- **Dependency direction, not folder ceremony.** Don't force a `domain.ts`
  file on every module — force the *rule* (no Fastify/Drizzle/SDK types in
  business-rule code). Split into a `domain.ts` once a `service.ts` earns it
  by size or reuse; see [rules/layers.md](rules/layers.md).
- **Interfaces live with their consumer, not their implementation.** A port
  is declared by the application code that needs it; the adapter satisfies it
  from the rim. `@devdigest/shared`'s `adapters.ts` is the existing example.
- **The composition root is the only privileged file.** Only
  `platform/container.ts` and `modules/index.ts` may know about every
  concrete adapter at once.
- **Reuse what's already installed.** `dependency-cruiser` is already a
  `server/` devDependency (used today for repo-intel's `DepGraph` adapter) —
  point it at this repo's own `src/` instead of adding a new tool.
- **This is a repo-specific application of a public pattern.** Cite the
  primary sources ([SOURCES.md](SOURCES.md)) when the rule is non-obvious;
  don't restate generic Onion Architecture theory that Palermo/Graça already
  cover — link it.

## Sources

Full annotated research and the original skill plan: [SOURCES.md](SOURCES.md).
Primary sources for the pattern itself:
- [Jeffrey Palermo — The Onion Architecture, part 1 (2008)](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)
- [Herberto Graça — Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/)
- [Wikipedia — Hexagonal architecture (software)](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software))
