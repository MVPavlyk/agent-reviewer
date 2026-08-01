# @devdigest/web

Next.js 15 (App Router) studio UI: import repos, browse PRs, run and read
reviews, author agents.

## Read when
| Trigger | Read |
|---|---|
| routes or data-fetching surprise you | [README.md](./README.md) — UI route map |
| behaviour is non-obvious / mid-debug | [INSIGHTS.md](./INSIGHTS.md) |

## Commands
`pnpm dev` (:3000) · `pnpm test` (vitest + jsdom, fetch mocked, no API needed)
`pnpm typecheck`

## Conventions
- Pages (`src/app/**/page.tsx`) stay thin; feature logic lives in colocated
  `_components/<Name>/` folders, each with its own `*.test.tsx`.
- All API access goes through `src/lib/hooks/*` (TanStack Query) →
  `src/lib/api.ts`. Never `fetch` directly from a component.
- UI strings live in `messages/<locale>/*.json` (`next-intl`), not inline.
- `src/vendor/shared` (`@devdigest/shared`) and `src/vendor/ui` (`@devdigest/ui`)
  are vendored copies, not npm packages — see root `CLAUDE.md` for the
  server/client drift rule before editing `vendor/shared`.

## Gotchas
- Importing a runtime **value** from `vendor/shared/index.ts` pulls the whole
  barrel into the webpack bundle. See the workaround in
  [src/lib/feature-models.ts](./src/lib/feature-models.ts) before adding a new
  value export there.
