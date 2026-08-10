# The dependency-direction rule

> All coupling is toward the center. A ring may import from rings more
> central than itself; it may never import from a ring further out.
> — [Jeffrey Palermo, 2008](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)

This is the one rule this skill exists to enforce. Everything else
(`rules/layers.md`, `rules/ports-and-di.md`) exists to make this rule
checkable in this repo's specific shape.

## The check, concretely

Before adding an import, ask: **does this file express a business rule, or
does it talk to the outside world?**

- If it expresses a business rule (validation, calculation, deciding what
  happens next based on domain state) — it must not import:
  - anything from `fastify` or a Fastify plugin type
  - anything from `drizzle-orm`, `../../db/client.js`, `../../db/schema.js`
  - a concrete adapter class (`OctokitGitHubClient`, `OpenAIProvider`, …)
  - `platform/container.ts`'s concrete `Container` construction (the *type*
    `Container` for DI is fine in application code — see
    [ports-and-di.md](ports-and-di.md) — constructing or reaching into its
    adapters directly is not)
- If it talks to the outside world (HTTP request/response, SQL, an external
  API call) — it belongs in infrastructure and may import all of the above,
  but must not contain business rules an application/domain file should own.

## Concrete violation shapes to flag in review

**1. A route handler making a decision instead of delegating it.**
```ts
// routes.ts — VIOLATION: business rule (severity threshold) lives in the adapter
app.post('/findings/:id/action', async (req, reply) => {
  const finding = await repo.getFinding(req.params.id);
  if (finding.severity === 'critical' && req.body.action === 'dismiss') {
    return reply.code(403).send({ error: 'cannot dismiss critical findings' });
  }
  // ...
});
```
Fix: the rule ("critical findings can't be dismissed") is a domain
invariant. It belongs in `service.ts` (or `domain.ts`/`findings.ts` once
split), called from the route as `service.actOnFinding(...)`, which throws a
typed error the route translates to a status code.

**2. A service reaching past its repository interface into Drizzle directly.**
```ts
// service.ts — VIOLATION: application layer touching drizzle-orm
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import * as t from '../../db/schema.js';

async getStalePulls() {
  return db.select().from(t.pulls).where(eq(t.pulls.stale, true));
}
```
Fix: add the query to `repository.ts` (`repo.getStalePulls()`), have
`service.ts` call the repository method. The service should never know a
table is called `pulls` in SQL.

**3. A domain type that is actually a Drizzle row type.**
```ts
// service.ts — VIOLATION: AgentRow is `typeof t.agents.$inferSelect`,
// a schema-shaped type, used as if it were a domain type
import type { AgentRow } from '../../db/rows.js';

resolveTargets(...): Promise<AgentRow[]> { ... }
```
This is the one confirmed soft spot in this repo today
(`modules/reviews/service.ts`): `AgentRow` is a Drizzle-inferred row type
crossing into application-layer signatures. It is not automatically wrong —
Onion tolerates thin repos where the "domain type" and "row type" are
intentionally the same shape to avoid mapper ceremony — but it **is** wrong
the moment `AgentRow` starts carrying Drizzle-specific fields (`$inferSelect`
metadata, nullable columns that don't mean anything in domain terms) into
business logic. Treat it as a judgment call: acceptable for simple
CRUD-shaped modules, worth a real DTO the moment the row type and the domain
concept diverge.

## What's *not* a violation

- `service.ts` importing the `Container` **type** to receive DI-wired
  dependencies (`constructor(private container: Container)`). The type
  itself is a composition-root concern being *passed in*, not the service
  reaching out to construct adapters. This is standard constructor injection.
- `repository.ts` importing Drizzle and the schema — that's its job, it's
  infrastructure.
- `reviewer-core`'s `llm/*.ts` importing an LLM SDK — same reasoning,
  it's the adapter satisfying the `LLMProvider` port.
