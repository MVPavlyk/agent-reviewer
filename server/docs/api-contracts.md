# API contracts — checklist for a new/changed endpoint

Before adding or changing a route in `server/`, follow the conventions already
established in [../CLAUDE.md](../CLAUDE.md) (source of truth — this doc only
collects them in one place for the "adding an endpoint" trigger):

1. **One module = one Fastify plugin.** A route belongs in
   `modules/<name>/{routes,service,repository}.ts`, registered statically in
   `src/modules/index.ts`. Don't add a route file that isn't wired there.
2. **Schema-first validation.** `params`/`body` go through zod via
   `fastify-type-provider-zod` — bad input is rejected with 422 before the
   handler runs. Never hand-roll `Schema.parse` inside a handler.
3. **Adapters come from the DI container.** `platform/container.ts` is the
   only place a concrete adapter (DB, GitHub client, LLM provider, …) gets
   constructed — a route or service must never `new` one directly, so tests
   can swap in `src/adapters/mocks.ts`.
4. **Where it fits.** Check the [API map](../README.md#api-map-starter) for
   which domain group (Repos & PRs, Review & runs, Agents, Repo intelligence,
   Platform) the new route belongs under, and follow an existing module in
   that group as the concrete pattern to copy.

See [../CLAUDE.md](../CLAUDE.md)'s `## Conventions` section for the full,
authoritative list — this file exists so "I'm adding an endpoint, what do I
need to know" has one direct target instead of re-deriving it from the whole
package doc every time.
