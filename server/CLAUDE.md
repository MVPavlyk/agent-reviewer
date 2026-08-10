# @devdigest/api

Fastify 5 + Drizzle/Postgres (pgvector): imports repos and PRs, indexes with
repo-intel, runs reviews through `reviewer-core`.

## Read when
| Trigger | Read |
|---|---|
| routes, DI, or pipeline wiring surprise you | [README.md](./README.md) — request/DI flow + API map |
| touching the indexer | [src/modules/repo-intel/README.md](./src/modules/repo-intel/README.md) |
| behaviour is non-obvious / mid-debug | [INSIGHTS.md](./INSIGHTS.md) |

## Commands
`pnpm dev` (:3001) · `pnpm db:migrate` · `pnpm db:seed` · `pnpm typecheck`

Tests split by filename, and there are **no `test:unit` / `test:integration`**
scripts — CI inlines these, so match it:
- unit (hermetic): `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- integration (testcontainers Postgres): `pnpm exec vitest run .it.test`

## Conventions
- One module = one Fastify plugin: `modules/<name>/{routes,service,repository}.ts`,
  registered statically in `src/modules/index.ts`.
- Routes are schema-first: zod `params`/`body` via `fastify-type-provider-zod`
  reject bad input with 422 before the handler runs. Don't hand-roll `Schema.parse`.
- Adapters sit behind the DI container (`platform/container.ts`) so tests can swap
  in `src/adapters/mocks.ts`. Never construct an adapter inside a service.
- Plugins register before modules (helmet · cors · rate-limit · SSE · error handler).

## Gotchas
- **Migrations do not run on boot.** `relation ... does not exist` → `pnpm db:migrate`.
- Secrets are not part of `AppConfig` — they go through `LocalSecretsProvider`
  (`~/.devdigest/secrets.json`, mode 0600, `process.env` fallback). Never put a key
  in config or the DB. `GITHUB_TOKEN` is canonical; `GITHUB_PAT` is a fallback.
- The schema already contains tables for unbuilt course features — an empty table
  is not a bug.
