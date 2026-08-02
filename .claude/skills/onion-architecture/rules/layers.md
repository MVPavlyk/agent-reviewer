# Layers (rings) and this repo's file mapping

Onion Architecture is four concentric rings. Each ring may depend only on
rings more central than itself.

| Ring | Responsibility | Never contains |
|---|---|---|
| **Domain** (innermost) | Entities, value objects, business rules, invariants | Any import of Fastify, Drizzle, Octokit, an LLM SDK, or `platform/container.ts` |
| **Application** | Use-case orchestration: call domain rules, call ports, no I/O itself | Concrete adapters — depends on *interfaces* only |
| **Ports** | Interfaces the application depends on and the infrastructure implements | Implementation code |
| **Infrastructure** (outermost) | Adapters: HTTP handlers, DB access, external API clients, the composition root | Business rules |

## Mapping onto `server/src/modules/<name>/`

| File | Ring | Notes |
|---|---|---|
| `domain.ts` *(add when a module earns it — see below)* | Domain | Pure functions/types. If it doesn't exist yet, the rule still applies to whatever code expresses the business rule, wherever it currently lives. |
| `service.ts` | Application | Orchestrates `domain.ts` + the module's repository **interface**. May import `Container` (the composition root's type) to receive already-wired adapters, but must not construct a Drizzle query or Fastify object itself. |
| a per-module repository interface (often just the exported class shape of `repository.ts`, used as a type) | Ports | Declared/consumed from `service.ts`'s perspective, satisfied by `repository.ts`. |
| `repository.ts`, `routes.ts` | Infrastructure | Allowed to import `db/client.ts`, `db/schema.ts`, Fastify types, Octokit, LLM SDKs. |
| `server/src/adapters/**` | Infrastructure | Same rule — these already sit behind interfaces in `@devdigest/shared` (`vendor/shared/adapters.ts`). |
| `server/src/platform/container.ts`, `server/src/modules/index.ts` | Composition root | The *only* files allowed to import every concrete adapter and wire them to interfaces. |

## Mapping onto `reviewer-core/`

Already correctly layered — use as the reference, don't restructure it:

| File | Ring |
|---|---|
| `review/run.ts`, `review/reduce.ts`, `grounding.ts`, `prompt.ts` | Domain + Application (the package has no HTTP/DB concerns, so these two rings collapse into one package without a Fastify/Drizzle rim to separate from) |
| `llm/openrouter.ts`, `llm/structured.ts` | Infrastructure, behind the `LLMProvider` port |
| `output/to-review.ts` | Application (shapes domain output for a consumer) |

## Do you need a literal `domain.ts` file?

**No, not by default.** Forcing a new file on every module adds ceremony
Vertical Slice Architecture explicitly warns against (see
[rules/vertical-slices.md](vertical-slices.md)). The enforceable minimum is
the **dependency-direction rule** — see
[rules/dependency-direction.md](dependency-direction.md) — regardless of
which file the business rule currently lives in.

Split business rules out of `service.ts` into a `domain.ts` when **any** of
these become true:
- `service.ts` exceeds roughly 150–200 lines and a clear "pure calculation /
  validation vs. orchestration" seam is visible (this repo already does this
  once — `modules/reviews/helpers.ts` and `modules/reviews/findings.ts` are
  exactly this split, just not named `domain.ts`).
- The same business rule needs to be reused or tested independently of the
  `Container`-wired service.
- A code reviewer can't tell, from the diff, whether a change is a business
  rule change or a wiring change.

When you do split, follow the naming this repo already uses
(`helpers.ts`, `findings.ts` in `modules/reviews/`) rather than inventing a
new `domain.ts` convention repo-wide — consistency with existing modules
beats matching an external template file name.
