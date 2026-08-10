# Examples

## Good: `reviewer-core` (no restructuring needed, cite as reference)

```ts
// reviewer-core/src/review/run.ts — domain+application, zero framework imports
export async function runReview(input: ReviewInput, llm: LLMProvider): Promise<Review> {
  const prompt = assemblePrompt(input);
  const raw = await llm.completeStructured({ schema: ReviewSchema, prompt });
  return groundFindings(raw, input.diff);
}
```

```ts
// reviewer-core/src/llm/openrouter.ts — infrastructure, implements the port
export class OpenRouterProvider implements LLMProvider {
  async completeStructured(opts: CompleteOpts) {
    /* SDK-specific call */
  }
}
```

`runReview` never imports `openrouter.ts`. It receives an `LLMProvider` from
its caller (`server/src/platform/container.ts`). This is the whole pattern.

## Before/after: a route handler that grew a business rule

**Before** — the rule ("critical findings can't be dismissed") lives in
`routes.ts`, invisible to anything that isn't reading HTTP handlers, and
untestable without spinning up Fastify:

```ts
// modules/reviews/routes.ts
app.post('/findings/:id/action', async (req, reply) => {
  const finding = await service.repo.getFinding(req.params.id);
  if (finding.severity === 'critical' && req.body.action === 'dismiss') {
    return reply.code(403).send({ error: 'cannot dismiss critical findings' });
  }
  const result = await service.actOnFinding(req.params.id, req.body.action);
  return reply.send(result);
});
```

**After** — the rule moves into the application layer where it's a plain
function call, testable without Fastify, and the route becomes a thin
adapter:

```ts
// modules/reviews/findings.ts (application — already exists in this repo)
export async function actOnFindingImpl(repo: ReviewRepository, id: string, action: FindingActionKind) {
  const finding = await repo.getFinding(id);
  if (finding.severity === 'critical' && action === 'dismiss') {
    throw new ForbiddenError('cannot dismiss critical findings');
  }
  return repo.applyAction(id, action);
}
```

```ts
// modules/reviews/routes.ts
app.post('/findings/:id/action', async (req, reply) => {
  const result = await service.actOnFinding(req.params.id, req.body.action); // throws ForbiddenError → error handler maps to 403
  return reply.send(result);
});
```

## Before/after: a service reaching past its repository

**Before:**
```ts
// modules/pulls/service.ts — VIOLATION
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import * as t from '../../db/schema.js';

async getStalePulls() {
  return db.select().from(t.pulls).where(eq(t.pulls.stale, true));
}
```

**After:**
```ts
// modules/pulls/repository.ts — infrastructure, this is its job
getStalePulls(): Promise<PullRow[]> {
  return this.db.select().from(t.pulls).where(eq(t.pulls.stale, true));
}
```
```ts
// modules/pulls/service.ts — application, delegates
async getStalePulls() {
  return this.repo.getStalePulls();
}
```

The service no longer knows the table is called `pulls` or that the flag is
a boolean column — it just asks its repository for "stale pulls," which is
the vocabulary a domain reader expects.
