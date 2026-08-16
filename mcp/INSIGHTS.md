# INSIGHTS — @devdigest/mcp

Append-only running notes for this package — what the code and CLAUDE.md don't
already say. Written by the `engineering-insights` skill, read before
non-obvious work here. Conventions live in CLAUDE.md; this file holds what
someone learned the hard way.

Entry format (one line, dated, anchored to a file, a command, or an exact error):

    - **YYYY-MM-DD** — claim, with what to do — `path/file.ts:42`

## What Works

## What Doesn't Work

## Codebase Patterns
- **2026-08-16** — `POST /pulls/:id/review` is ASYNC: it returns `{runs:[…], reviews:[]}` immediately and never back-fills `reviews` — poll `GET /pulls/:prId/runs` until the run row hits `done|failed|cancelled`, then read `GET /pulls/:prId/reviews` — `src/tools/run-agent-on-pull-request.ts:30`
  The `ReviewRunResponse` docstring says reviews are "returned once the (synchronous) run completes" — that describes an intent the route never had (`server/src/vendor/shared/contracts/review-api.ts:44`); trust the route, not the comment.
- **2026-08-16** — match a finished review by `run_id`, never by `agent_id`: a PR accumulates one `agent_runs` row per invocation, so agent-id matching silently returns an EARLIER run’s review — `src/tools/run-agent-on-pull-request.ts:79`

## Tool & Library Notes
- **2026-08-16** — editing `src/**` does nothing to the live tool: the stdio server loads its sources once at startup, so the MCP client must reconnect the server before a change takes effect. Verify a handler without a reconnect by importing it in a throwaway script and running `npx tsx --tsconfig tsconfig.json .try-run.ts`.
- **2026-08-16** — that throwaway `tsx` script must live INSIDE `mcp/` (it needs the package’s `"type": "module"`); run it from a scratchpad path and esbuild treats it as CJS: `ERROR: Top-level await is currently not supported with the "cjs" output format`.

## Recurring Errors & Fixes

## Decisions
- **2026-08-16** — `DEVDIGEST_RUN_TIMEOUT_MS` defaults to 300s because run durations on a single PR spanned 16s (Security Reviewer) to 251s (API Contract Reviewer) — a 60s default would time out healthy runs. On timeout the run is NOT cancelled, so the error tells the caller to pick the result up via `get_findings` — `src/tools/run-agent-on-pull-request.ts:32`

## Session Notes
- **2026-08-16** — `run_agent_on_pull_request` always failed with `no_review_returned`; root cause was the async review endpoint, not a broken agent. Rewrote the tool to poll the run history, added `run_failed`/`run_timeout`/`no_run_started` errors, and added `mcp` to `append-insight.sh`’s package list.

## Open Questions
