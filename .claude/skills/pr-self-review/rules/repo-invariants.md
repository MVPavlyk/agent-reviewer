# Repo invariants — cross-package checks no framework skill covers

These come straight out of the four package `CLAUDE.md` files, not out of a
framework skill — they're specific to how *this* repo is put together. Root
CLAUDE.md forbids restating framework conventions in a `CLAUDE.md`, so this
file mirrors that discipline: only repo-specific rules, each with an anchor
you can verify mechanically. Run these on every file in scope, regardless of
which domain skills were routed — they apply even to files that landed in the
"no skill applies" general bucket.

The CRITICAL-tier version of several of these lives in
[severity.md](severity.md) ("Always-CRITICAL repo invariants") — that list
always wins if a check could plausibly be either. Everything here is WARNING
unless promoted there.

## Root CLAUDE.md

| Check | Anchor | Severity |
|---|---|---|
| Package manager not mixed (see [severity.md](severity.md) #1 for the CRITICAL form) | `CLAUDE.md` "Package managers — DO NOT MIX" table | CRITICAL |
| `@devdigest/shared` added to `client/src/vendor/shared` without first existing in `server/src/vendor/shared` | `CLAUDE.md` "Shared contracts" | CRITICAL (severity.md #8) |
| Illegal import direction (`client ↛ server`, `server ↛ client`, `reviewer-core ↛ both`) | `CLAUDE.md` "Import direction" | CRITICAL (severity.md #4) |
| A framework/library convention restated inside a `CLAUDE.md` instead of linked to `.claude/skills/` | `CLAUDE.md` "Framework conventions" | WARNING |
| A skill under `.claude/skills/*/SKILL.md` was created or its scope/sections changed, with no evidence `skill-creator` was run as the QA gate | `CLAUDE.md` "Creating or editing a skill" | WARNING |
| `server/clones/**` or `server/src/db/migrations/*`/`meta/**` hand-edited | `CLAUDE.md` "Do not touch" | CRITICAL (severity.md #2, #9) |

## `server/CLAUDE.md`

| Check | Anchor | Severity |
|---|---|---|
| A new module under `server/src/modules/<name>/` not registered in `server/src/modules/index.ts` | server `CLAUDE.md` module-registration convention | WARNING |
| A route validates its body/params/query with hand-rolled `Schema.parse(...)` instead of the `fastify-type-provider-zod` schema-first convention | server `CLAUDE.md` routes-are-schema-first rule | WARNING |
| An adapter instantiated inside a `service.ts` instead of resolved through `platform/container.ts` DI | server `CLAUDE.md` adapters-via-DI rule | CRITICAL (severity.md #6) |
| A migration expected to run automatically on server boot | server `CLAUDE.md` "migrations don't run on boot" | WARNING |
| A secret literal outside `LocalSecretsProvider` (config file, DB column, hardcoded string) | server `CLAUDE.md` secrets rule | CRITICAL (severity.md #7) |

## `client/CLAUDE.md`

| Check | Anchor | Severity |
|---|---|---|
| Business logic living directly in a `page.tsx` instead of a colocated `_components/<Name>/` | client `CLAUDE.md` "pages stay thin" | WARNING |
| A changed/added component under `_components/<Name>/` with no colocated `*.test.tsx` touched in the same diff | client `CLAUDE.md` colocated-tests convention | WARNING |
| `fetch`/axios/etc. called directly inside a component instead of through `src/lib/hooks/*` → `src/lib/api.ts` | client `CLAUDE.md` API-access rule | CRITICAL (severity.md #5) |
| A UI string hardcoded inline instead of added to `messages/<locale>/*.json` (next-intl) | client `CLAUDE.md` i18n rule | WARNING |
| A new export added to `src/lib/feature-models.ts` (or a similar barrel) that isn't a type, risking the barrel value-import bundle gotcha the client `CLAUDE.md` calls out | client `CLAUDE.md` barrel gotcha | WARNING |

## `reviewer-core/CLAUDE.md`

| Check | Anchor | Severity |
|---|---|---|
| Any import of db/http/fs/`process.env` inside `reviewer-core/src/**` | reviewer-core `CLAUDE.md` "Invariant — do not break" | CRITICAL (severity.md #3) |
| A local `reviewer-core/src/vendor/` copy of shared types instead of resolving via the tsconfig `paths` alias | reviewer-core `CLAUDE.md` "no src/vendor" | CRITICAL (severity.md #3) |
| A finding kept without passing through `groundFindings()` | reviewer-core `CLAUDE.md` grounding-is-mandatory rule | CRITICAL (severity.md #3) |
| A score read directly off the model's response instead of recomputed from surviving findings | reviewer-core `CLAUDE.md` deterministic-score rule | CRITICAL (severity.md #3) |
| An empty prompt slot (`skills`, `memory`, `specs`, `callers`) rendered as an empty heading instead of omitted | reviewer-core `CLAUDE.md` prompt-slot convention | WARNING |
| A `pnpm-lock.yaml` present, or `pnpm` used instead of `npm` | reviewer-core `CLAUDE.md` "npm not pnpm" | CRITICAL (severity.md #1) |

## `e2e/CLAUDE.md`

| Check | Anchor | Severity |
|---|---|---|
| Imperative logic added to `run.ts` where a declarative `specs/*.flow.json` step would do | e2e `CLAUDE.md` declarative-flows rule | WARNING |
| A flow that depends on execution order or on non-seeded data | e2e `CLAUDE.md` order-independence rule | WARNING |
| An LLM call added anywhere in `e2e/` | e2e `CLAUDE.md` no-LLM-calls rule | WARNING |
| A `pnpm-lock.yaml` present, or `pnpm` used instead of `npm` | e2e `CLAUDE.md` "npm not pnpm" | CRITICAL (severity.md #1) |

## Deletions (from [routing.md](routing.md) §2)

| Check | Severity |
|---|---|
| A deleted `service.ts`/`route.ts`/`repository.ts` leaves a dangling reference in `modules/index.ts` or in a caller that still imports it | WARNING |

## `.claude/skills/README.md` catalog

| Check | Severity |
|---|---|
| A new skill directory added under `.claude/skills/` with no matching row added to `.claude/skills/README.md`'s catalog table | WARNING |
