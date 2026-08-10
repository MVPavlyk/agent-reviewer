# Reconciling Onion rings with this repo's vertical slices

`server/CLAUDE.md`: "One module = one Fastify plugin:
`modules/<name>/{routes,service,repository}.ts`." That is Vertical Slice
Architecture — organize by feature — not the horizontal
`controllers/`, `services/`, `repositories/` folder split many Onion
tutorials show. **This skill does not ask you to change that.**

## Why these two aren't opposites

Onion Architecture's actual claim is narrower than "put horizontal layers in
separate top-level folders": it's "dependencies point inward, domain logic
stays framework-free." Vertical Slice Architecture's claim is "organize by
feature, keep a slice cohesive." Neither claim contradicts the other —
[Milan Jovanović](https://milanjovanovic.tech/blog/where-vertical-slices-fit-inside-the-modular-monolith-architecture)
frames this precisely: *"the micro-architecture is a local decision each
module can make independently."*

So: this repo's top-level shape stays feature-first
(`modules/<name>/`). The Onion rule applies **inside** each module folder,
between its files — `routes.ts` (infra) → `service.ts` (application) →
`repository.ts` (infra, behind an implicit port) — per
[rules/layers.md](layers.md)'s file mapping.

## What this means in practice

- **Do not** propose a repo-wide restructuring into
  `server/src/{domain,application,infrastructure}/`. That would break the
  module-per-plugin convention `server/CLAUDE.md` documents and this repo's
  existing tests/imports.
- **Do** apply the dependency-direction rule when reviewing or writing
  *within* a module: a `routes.ts` handler must not contain a business
  decision; a `service.ts` must not construct a Drizzle query or a concrete
  adapter.
- **Do** let module internals vary in how strictly they split domain from
  application — a three-line CRUD module doesn't need the same rigor as
  `modules/reviews/`, which already demonstrates the split via
  `helpers.ts`/`findings.ts`/`run-executor.ts` alongside `service.ts`. This
  matches [kgrzybek's modular-monolith-with-ddd discussion](https://github.com/kgrzybek/modular-monolith-with-ddd/discussions/225):
  each module picks its own internal rigor.
- `reviewer-core` is the one package where the whole package *is* effectively
  a single ring pair (domain+application) with no infra rim of its own — it's
  consumed as infrastructure-behind-a-port by `server/`. Don't try to carve
  vertical slices inside it; it's already the smallest sensible unit.

## Trade-off to name explicitly when advising

Vertical Slice optimizes for change velocity per feature; Onion optimizes for
long-lived testability and infra decoupling
([CSA comparison](https://www.csa.ch/en/blog/architectures-in-comparison-onion-or-vertical-slice)).
This repo has already chosen Vertical Slice at the top level (feature
velocity, one plugin per module, easy to delete a module). Importing Onion's
*internal* dependency-direction rule captures the testability/decoupling
benefit without giving up that choice — but don't oversell it: a module that
will only ever have one implementation of its repository doesn't need a
formal port, per [ports-and-di.md](ports-and-di.md).
