# @devdigest/e2e

Deterministic browser e2e (agent-browser) over the real stack — no LLM involved.

## Read when
| Trigger | Read |
|---|---|
| writing or debugging a flow | [README.md](./README.md) — spec format + runner |
| behaviour is non-obvious / mid-debug | [INSIGHTS.md](./INSIGHTS.md) |

## Commands
**npm, not pnpm** (`package-lock.json`). `../scripts/e2e.sh` boots Postgres +
API + web from zero; `npm test` (`tsx run.ts`) then runs the specs against an
already-running stack. `npm run typecheck`.

## Conventions
- A flow is a declarative `specs/*.flow.json` — `{cmd, label}` steps. Add
  imperative logic in `run.ts` only when a flow genuinely can't be expressed
  declaratively.
- Flows must be order-independent and assert only against **seeded** data
  (`pnpm db:seed` in `server/`) — no flow may depend on another flow's side effects.
- No LLM calls anywhere in this package; flows exercise UI + API + DB only.
