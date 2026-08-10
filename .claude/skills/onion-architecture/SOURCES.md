# `onion-architecture` — research & skill plan

Research pass for a planned skill that **forces Onion Architecture discipline**
on this repo's backend packages (`server/`, `reviewer-core/`). Not yet
implemented — `SKILL.md` does not exist.

Status: **research + plan only**.
Researched: 2026-08-02.

## Scope boundary vs existing skills

| Existing skill | Owns | This skill must NOT restate |
|---|---|---|
| `fastify-best-practices` | routes, plugins, hooks, schemas, error handling | HTTP-layer mechanics |
| `drizzle-orm-patterns` | schema/query/transaction syntax | Drizzle API itself |
| `postgresql-table-design` | column types, indexing, constraints | table design |
| `security` | OWASP, auth, injection | security rules |
| `typescript-expert` | type-level programming | type syntax |

The gap this skill fills: **which layer a piece of backend logic belongs in,
and which direction its dependencies are allowed to point** — a placement/DI
rule, not a syntax rule. Same relationship `frontend-architecture` has to
`react-best-practices`/`next-best-practices`.

---

## Where this repo already stands (read before writing rules)

This matters more than any external article — the skill must **reconcile with
existing convention**, not import a textbook layout wholesale.

- **`reviewer-core/` is already a near-pure Onion core.** `review/run.ts` and
  `review/reduce.ts` contain the actual business logic (diff → prompt → LLM →
  findings) with no Fastify, no Drizzle, no HTTP. `llm/openrouter.ts` sits
  behind an interface consumed by the core, not the other way round. This
  package is the skill's best worked example of "domain has zero framework
  imports."
- **`server/` is organized as vertical slices (Fastify plugins), not
  horizontal layers.** [`server/CLAUDE.md`](../../../server/CLAUDE.md):
  "One module = one Fastify plugin: `modules/<name>/{routes,service,repository}.ts`."
  This is feature-first / vertical-slice, the same family the "Onion vs
  Vertical Slice" research below discusses — **not** a `controllers/`,
  `services/`, `repositories/` global split. The skill must not demand global
  horizontal folders; the correct move is Onion **dependency direction**
  enforced *inside* each module/slice.
- **DI already exists**: `server/src/platform/container.ts` holds adapters
  behind interfaces (`AuthProvider`, `GitHubClient`, `LLMProvider`,
  `Embedder`, …) defined in `@devdigest/shared` (`server/src/vendor/shared/adapters.ts`),
  swappable via `ContainerOverrides` for tests. This is the ports/adapters
  half of Onion, already working — document it, don't reinvent it.
- **Gap observed**: `service.ts` files inside modules (e.g.
  `modules/reviews/service.ts`) currently mix orchestration with some
  Drizzle-aware calls directly rather than going through `repository.ts`
  uniformly — worth a closer read before writing the "service must not import
  the db client" rule, to confirm it's a real violation and not a false read.

## Q1 — What Onion Architecture actually is (primary/original sources)

**Consensus:** concentric layers, dependencies point only inward, the domain
model is innermost and framework-free. Onion is a refinement of Ports &
Adapters (Hexagonal) that adds internal domain sub-layers.

| # | Source | URL | Why it matters |
|---|---|---|---|
| 1 | **Jeffrey Palermo — The Onion Architecture, part 1** | https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/ | The original 2008 post that coined the term. Primary source, cite first. |
| 2 | **Jeffrey Palermo — onion-architecture tag (parts 2–4 + follow-ups)** | https://jeffreypalermo.com/tag/onion-architecture/ | The rest of the original series — layer responsibilities, the "no infrastructure knows about the core" rule. |
| 3 | **Herberto Graça — Onion Architecture** | https://herbertograca.com/2017/09/21/onion-architecture/ | Best modern synthesis; explicitly maps Onion's relationship to Ports & Adapters and Clean Architecture (same idea, different vocabulary). Good diagram source. |
| 4 | **DZone — Onion Architecture Is Interesting** | https://dzone.com/articles/onion-architecture-is-interesting | Concise secondary explainer, useful for the "why" section. |
| 5 | **DEV — Onion Architecture 🧅 (Barry McAuley)** | https://dev.to/barrymcauley/onion-architecture-3fgl | Approachable walkthrough with a layer diagram, good for a "TL;DR" box in SKILL.md. |
| 6 | **iammukeshm/OnionArchitecture (GitHub)** | https://github.com/iammukeshm/OnionArchitecture | Reference repo implementing the pattern; source of the "all layers depend only on layers more central" rule statement. |

## Q2 — Ports & Adapters / Hexagonal (the architecture Onion builds on)

| # | Source | URL | Why it matters |
|---|---|---|---|
| 7 | **Wikipedia — Hexagonal architecture (software)** | https://en.wikipedia.org/wiki/Hexagonal_architecture_(software) | Alistair Cockburn's original framing: driving vs driven ports/adapters. This repo's `container.ts` is literally this pattern already — cite to explain *why* it exists. |
| 8 | **arc42 Quality Model — Hexagonal Architecture** | https://quality.arc42.org/approaches/hexagonal-architecture | Crisp definition: "core owns its ports... adapters implement the ports, source-code dependencies point only inward." Good one-paragraph summary to quote. |
| 9 | **TopicTrick — Clean Architecture vs Hexagonal: The Complete Practical Guide** | https://topictrick.com/blog/clean-vs-hexagonal-architecture | Disambiguates three names (Onion/Hexagonal/Clean) people conflate — needed so the skill doesn't contradict itself when someone says "clean architecture" instead of "onion." |

## Q3 — Onion/Clean Architecture applied to Node.js + TypeScript + Fastify

| # | Source | URL | Why it matters |
|---|---|---|---|
| 10 | **Sankhadip Samanta — Onion Architecture in Node.js with TypeScript** | https://sankhadip.medium.com/onion-architecture-in-node-js-with-typescript-5508612a4391 | Node/TS-specific worked example: folder layout, DI wiring, interface placement. Closest match to this repo's stack. |
| 11 | **JeffMangan/typescript-onion (GitHub)** | https://github.com/JeffMangan/typescript-onion | Runnable TypeScript reference implementation — good for a "compare against a real repo" link in the skill. |
| 12 | **borjatur/clean-architecture-fastify-mongodb (GitHub)** | https://github.com/borjatur/clean-architecture-fastify-mongodb | Fastify-specific clean/onion template — shows how routes stay a thin adapter over use cases. |
| 13 | **marcoturi/fastify-boilerplate (GitHub)** | https://github.com/marcoturi/fastify-boilerplate | Fastify 5 boilerplate combining clean architecture + DDD + vertical-slice — directly relevant since this repo is Fastify 5 + module-per-slice already. |
| 14 | **Sentry Engineering Blog — Atomic Repositories in Clean Architecture and TypeScript** | https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/ | The repository-boundary rule this skill needs: "translate database errors into domain errors at the repository boundary; repository interfaces depend only on domain types." Maps directly onto this repo's `repository.ts` files. |
| 15 | **João Batista da Silva — Transactions with DDD and Repository Pattern in TypeScript (Part 2)** | https://medium.com/@joaojbs199/transactions-with-ddd-and-repository-pattern-in-typescript-a-guide-to-good-implementation-part-2-da0af3e10901 | How to keep transaction handling out of the domain while still supporting multi-repository transactions — relevant to Drizzle's `db.transaction`. |

## Q4 — Onion vs. this repo's actual module shape (vertical slice / modular monolith)

**Consensus:** Onion (horizontal layers by technical concern) and Vertical
Slice (folders by feature) are not opposites — they compose. A module can be
internally onion-shaped (domain → application → infra) while the top-level
folder structure stays feature-first. This is the reconciliation the skill
must state explicitly, the same way `frontend-architecture` reconciled FSD
layers with route-segment colocation.

| # | Source | URL | Why it matters |
|---|---|---|---|
| 16 | **Architectures in Comparison: Onion or Vertical Slice? (CSA)** | https://www.csa.ch/en/blog/architectures-in-comparison-onion-or-vertical-slice | Direct comparison; states Onion optimizes for long-lived testability/decoupling, Vertical Slice optimizes for change velocity per feature. |
| 17 | **Milan Jovanović — Where Vertical Slices Fit Inside the Modular Monolith Architecture** | https://milanjovanovic.tech/blog/where-vertical-slices-fit-inside-the-modular-monolith-architecture | The key reconciling idea: "the micro-architecture is a local decision each module can make independently" — i.e. apply Onion's dependency-direction rule *inside* `modules/<name>/`, not as a repo-wide horizontal split. This is the model to prescribe. |
| 18 | **Jimmy Bogard — Vertical Slice Architecture** | https://www.jimmybogard.com/vertical-slice-architecture/ | Originating article for vertical slices, useful to define the term precisely before contrasting it with Onion. |
| 19 | **kgrzybek/modular-monolith-with-ddd — "Using Vertical Slice Architecture" (Discussion #225)** | https://github.com/kgrzybek/modular-monolith-with-ddd/discussions/225 | Practitioner discussion of combining DDD/Onion internals with vertical-slice module boundaries — closest analog to this repo's `modules/<name>/{routes,service,repository}` shape plus a would-be `domain.ts`. |
| 20 | **DEV — Clean Architecture vs Vertical Slice Architecture** | https://dev.to/rexebin/clean-architecture-vs-vertical-slice-architecture-3mja | Restates that Clean/Onion just adds a dependency-direction rule on top of use-case orientation, which Vertical Slice already has — supports "compose, don't replace" framing. |

## Q5 — Enforcing the dependency rule mechanically (so it doesn't rot)

Same lesson as `frontend-architecture` Q9: an unenforced layering rule is a
suggestion. Needed since this repo has no `packageManager` field either and
already relies on CI (not convention alone) to catch drift — see root
`CLAUDE.md`.

| # | Source | URL | Why it matters |
|---|---|---|---|
| 21 | **dependency-cruiser** | https://github.com/sabinaman/dependency-cruiser (canonical: `github.com/sverweij/dependency-cruiser`) | This repo **already has** `DepCruiseGraph` (`server/src/adapters/depgraph/index.js`) wired for repo-intel analysis of *imported* repos — the skill should propose reusing the same tool to lint this repo's own `domain → app → infra` direction, not introduce a new dependency. |
| 22 | **eslint-plugin-boundaries** | https://github.com/javierbrea/eslint-plugin-boundaries | Alternative/complementary to dependency-cruiser: declare layer types (`domain`, `application`, `infra`) per module and forbid inward-to-outward imports at lint time, in-editor. |

---

## Draft layer mapping for this repo (to validate while writing SKILL.md)

Proposed per-module shape inside `server/src/modules/<name>/`, layered
*within* the existing vertical slice rather than replacing it:

| Onion layer | This repo's file | Rule |
|---|---|---|
| Domain (core) | `<name>/domain.ts` *(new — currently implicit/mixed into `service.ts`)* | Pure types + business rules. No Fastify, no Drizzle, no `@devdigest/shared` adapter imports. |
| Application (use cases) | `service.ts` | Orchestrates domain + repository interfaces. Depends on `repository.ts`'s **interface**, not Drizzle directly. |
| Ports (interfaces) | `@devdigest/shared` (`server/src/vendor/shared/adapters.ts`) + a per-module repository interface | Already the pattern for external adapters (`LLMProvider`, `GitHubClient`, …); extend the same idea to each module's repository. |
| Infrastructure (adapters) | `repository.ts` (Drizzle), `routes.ts` (Fastify), `server/src/adapters/**` | Implements ports. Allowed to know about Drizzle/Fastify/Octokit. Never imported by `domain.ts`. |
| Composition root | `platform/container.ts`, `modules/index.ts` | The one place allowed to wire concrete adapters to interfaces. |

`reviewer-core/` needs no restructuring — it already matches this table
(`review/*.ts` = domain+application, `llm/*.ts` = ports/adapters via
`LLMProvider`). Use it as the "gold standard" example in `SKILL.md`.

**Open question to resolve before writing rules.md files:** whether to
require a literal `domain.ts` file per module (adds ceremony to small
modules) or only require the *dependency direction* rule (no Drizzle/Fastify
types inside functions that express business rules, wherever they live). The
Vertical Slice sources (Q4) argue against forcing new files on small modules;
lean toward the dependency-direction rule as the enforceable minimum, and
`domain.ts` as a recommended split once a module's `service.ts` grows large
enough to need it.

---

## Proposed skill plan

```
.claude/skills/onion-architecture/
├── SKILL.md              # overview, layer table above, when to apply, TL;DR diagram
├── tile.json              # registration (mirrors fastify-best-practices/tile.json)
├── rules/
│   ├── layers.md           # domain/application/ports/infrastructure definitions + this repo's mapping
│   ├── dependency-direction.md   # the core enforceable rule + violation examples (service.ts importing db client, route handler containing business logic)
│   ├── ports-and-di.md     # interface-first adapters; container.ts as composition root; testing via ContainerOverrides
│   ├── vertical-slices.md  # reconciliation: onion *inside* modules/<name>/, not instead of it (Q4)
│   └── enforcement.md      # dependency-cruiser / eslint-plugin-boundaries wiring (Q5)
└── examples.md             # before/after using reviewer-core (good) vs a modules/* service.ts that needs cleanup
```

- Update `.claude/skills/README.md` catalog table to add the new row.
- Cross-link from `server/CLAUDE.md`'s "Conventions" section once the skill
  exists, the way other skills are referenced.

## Chores resolved (2026-08-02, before writing `SKILL.md`)

- Read `modules/reviews/service.ts` in full: it does **not** call Drizzle
  directly (`db.select`/`insert`/etc.) — the earlier "mixes Drizzle-aware
  calls" hypothesis was wrong. The real, narrower finding: it imports
  `AgentRow`, a Drizzle-inferred row type, into an application-layer method
  signature. Documented as a judgment call (not a flat violation) in
  [rules/dependency-direction.md](rules/dependency-direction.md) violation #3.
- Confirmed `dependency-cruiser@^17.4.3` is already a `server/`
  devDependency (`server/package.json`), used today only inside
  `server/src/adapters/depgraph` for analyzing cloned repos. No
  `.dependency-cruiser.cjs` self-lint config exists yet — proposed one in
  [rules/enforcement.md](rules/enforcement.md).
- Decided the `domain.ts`-per-module question: **no default file**, only the
  dependency-direction rule is mandatory; split into a dedicated file once a
  module earns it (size/reuse/reviewability), following this repo's existing
  precedent (`modules/reviews/helpers.ts`, `findings.ts`) rather than
  inventing a new file-name convention. See
  [rules/layers.md](rules/layers.md) "Do you need a literal `domain.ts` file?".

`SKILL.md` and `rules/*.md` are now written — this file remains as the
research trail and source list.
