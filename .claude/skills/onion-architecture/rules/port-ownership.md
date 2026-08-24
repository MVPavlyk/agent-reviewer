# Where a port is declared, not just whether one exists

SKILL.md's core principles state this in one line: *"A port is declared by
the application code that needs it; the adapter satisfies it from the
rim."* This rule spells out the violation that one line is guarding
against, because it's easy to miss — unlike the violations in
[dependency-direction.md](dependency-direction.md), this one doesn't show up
as a forbidden import (`fastify`, `drizzle-orm`, a concrete adapter
constructed inline). The application code can look completely correct —
constructor injection, no concrete class construction, no framework
types — and still have this problem.

## The violation

The interface itself is declared inside the adapter file that implements it,
instead of in `server/src/vendor/shared/adapters.ts` (or the module's own
service file, for a module-local port). Application code then imports the
*type* from the adapter's file path.

```ts
// adapters/notifications/slack-adapter.ts
export interface NotificationSender {
  send(message: { channel: string; text: string }): Promise<void>;
}

export class SlackNotificationSender implements NotificationSender { /* ... */ }
```

```ts
// modules/agents/service.ts — looks correct: constructor-injected, typed
// against an interface, no concrete class construction, no Fastify/Drizzle.
import type { NotificationSender } from '../../adapters/notifications/slack-adapter';

export class AgentRunner {
  constructor(private readonly notifications: NotificationSender) {}
  // ...uses this.notifications.send(...) throughout — correct usage
}
```

## Why this passes a shallow review and still breaks Onion's promise

Nothing here looks wrong at a glance: no `new SlackNotificationSender()` in
the service, no `fastify`/`drizzle-orm` import, dependency injected through
the constructor exactly like `Container`-wired adapters elsewhere in this
repo. A reviewer checking only "does this file construct concrete adapters
or import forbidden modules" passes it.

The actual problem is *ownership*. `service.ts` is supposed to own the
contract it depends on — that's what "the core declares the port" means.
Here, the contract is owned by the Slack adapter instead. Two concrete
consequences:

- **The port is not swappable in the way it appears to be.** If
  `slack-adapter.ts` is deleted or reworked (e.g. Slack is dropped for a
  different notifier), every file that imports `NotificationSender` from it
  breaks — even code that has nothing to do with Slack. The application
  layer's "I depend on an interface" claim was never true; it depended on
  one adapter's file existing.
- **A second implementation has nowhere correct to conform to.** If an
  `EmailNotificationSender` is added later, its author either duplicates the
  interface in the email adapter file (now two incompatible
  `NotificationSender` shapes exist) or imports the type from the Slack
  adapter file (an email adapter depending on a Slack file to get its own
  interface) — both are worse than the one-line fix of moving the interface
  to a neutral, adapter-agnostic location up front.

## The fix

Move the interface to `server/src/vendor/shared/adapters.ts`, next to
`AuthProvider`, `GitHubClient`, `LLMProvider`, etc. — this repo's existing,
correct example of the pattern (see
[rules/ports-and-di.md](ports-and-di.md)'s "What already exists" section).
The adapter file keeps only its concrete class, which imports and implements
the interface from its neutral home — the same direction every other
adapter in this repo already follows.

For a port that will only ever be consumed inside one module (not
cross-cutting like notifications), it's acceptable to declare the interface
in that module's own `service.ts` instead of `vendor/shared` — the point is
ownership by the consumer, not a specific file path. What's never
acceptable is the consumer importing its own dependency's shape from the
dependency.

## What's *not* a violation

- The adapter file importing and implementing a port declared elsewhere —
  that's the adapter doing its job.
- A type that's genuinely internal to the adapter (e.g. a raw third-party
  API payload shape) staying in the adapter file. Only the port itself —
  the interface application code is typed against — needs to live with its
  consumer.
- `reviewer-core`'s `LLMProvider` — already declared in
  `@devdigest/shared`, consumed by `reviewer-core`, implemented by
  `llm/openrouter.ts`. This is the pattern working correctly.
