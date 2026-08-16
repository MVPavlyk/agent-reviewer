# @devdigest/mcp

Local stdio MCP server: 5 tools proxying the already-running DevDigest API
(`server/`, `localhost:3001`) for external MCP clients (Claude Code/Desktop).

## Read when
| Trigger | Read |
|---|---|
| tool contracts (input shape, trimmed output, error text) surprise you | the plan this package was built from, and `src/tools/*.ts` directly — there is no README yet |
| behaviour is non-obvious / mid-debug | [INSIGHTS.md](./INSIGHTS.md) |

## Commands
**npm, not pnpm** (`package-lock.json`). `npm start` (`tsx src/index.ts`,
stdio transport — hangs waiting for a client, that's correct). `npm run
typecheck`. No build step and no tests package yet: the process always runs
as source via `tsx`, same as `reviewer-core/`.

## Conventions
- Every tool's input is a **flat** Zod shape (`{ repo, pr, agent }`, not a
  nested object) — human-readable identifiers in, resolved internally.
- `src/resolvers.ts` is the **only** place that calls `GET /repos`,
  `GET /repos/:id/pulls`, or `GET /agents`. A tool handler that inlines one of
  these calls directly is a bug — route it through `resolveRepo` /
  `resolvePr` / `resolveAgent` instead.
- Shared types (`Repo`, `PrMeta`, `Agent`, `ReviewRecord`, `FindingRecord`,
  `ConventionCandidate`, …) come only via the `@devdigest/shared` tsconfig
  alias (→ `../server/src/vendor/shared`). This package has **no
  `src/vendor/`** — never create a local copy.
- `src/schemas.ts` holds the **trimmed output** shapes each tool returns
  (`AgentSummary`, `FindingSummary`, `ReviewSummary`, `ConventionSummary`,
  …). These don't exist as server contracts — they're this package's own,
  defined to keep tool responses small and stable.
- Every resolve-miss or rate-limit throws a structured error
  (`src/errors.ts`) whose message names the next concrete step (call
  `list_agents`, check spelling via `gh repo view`, wait and retry) — never a
  bare "not found".

## Gotchas
- **No auth.** The server uses `LocalNoAuthProvider` with a single seeded
  workspace — this package hits `localhost:3001` directly, no token.
- `POST /pulls/:id/review` is rate-limited to **10/min** on the server; a 429
  is surfaced as `{ code: 'rate_limited', retryable: true }`, not a raw HTTP
  error.
- `PrMeta.id` is **nullable** in the shared contract
  (`server/src/vendor/shared/contracts/platform.ts`) — `resolvePr` returns
  the raw `PrMeta`; every caller must guard `pr.id` before using it (treat a
  null id the same as a pr-not-found).
- **Never write to stdout.** It's reserved for MCP protocol frames; any
  logging (including "server started") must go to stderr (`console.error`),
  never `console.log`.
