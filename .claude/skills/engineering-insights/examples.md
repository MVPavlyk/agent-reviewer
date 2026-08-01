# Calibration: what passes, what doesn't

Illustrative pairs — shapes to copy, not facts to trust. Only write an entry you
actually observed this session.

## Contents
- Vague vs useful
- Already documented (fails gate 4)
- Tooling's job, not an insight (fails gate 3)
- Section routing, worked through
- Refining an earlier entry
- A whole wrap-up, end to end

## Vague vs useful

❌ `- **2026-08-01** — Careful with the vendored shared types.`
Nothing to act on, no anchor, and the next agent still has to rediscover it.

✅ `- **2026-08-01** — Adding a value export to \`vendor/shared/index.ts\` also needs the same symbol re-exported from the client copy, or \`pnpm typecheck\` passes and the Next build fails — \`client/src/vendor/shared/index.ts:1\``

❌ `- **2026-08-01** — Vitest config was confusing.`

✅ `- **2026-08-01** — \`vitest run\` in \`server/\` picks up \`.it.test.ts\` too and hangs without Docker; the hermetic run is \`pnpm exec vitest run --exclude '**/*.it.test.ts'\` — \`server/vitest.config.ts\``

❌ `- **2026-08-01** — Reviewer prompts can get long.`

✅ `- **2026-08-01** — Diffs over ~400 changed lines silently truncate the prompt before the findings schema, so the model returns prose instead of JSON; chunk per-file above that — \`reviewer-core/src/prompt/build.ts:88\``

The difference is always the same: the useful one names a threshold, a file, or
an exact command, and tells you what to do instead.

## Already documented (fails gate 4)

These are all true, and all belong in the CLAUDE.md that already states them:

- "Migrations do not run on boot" — `server/CLAUDE.md`
- "Don't run `pnpm install` inside `reviewer-core/`" — root `CLAUDE.md`
- "All API access goes through `src/lib/hooks/*`" — `client/CLAUDE.md`

Restating a convention isn't capture — it's duplication that will drift.

## Tooling's job, not an insight (fails gate 3)

❌ "Remember to await the repository call in the review service."
A missing `await` on a typed promise is a typecheck finding. If it slipped
through, the fix is the type, not a note.

❌ "Import order keeps breaking the lint job."
Fix the lint autofix in the pre-commit path instead.

The exception: when the *tooling itself* misleads you, that's a real entry —
"`pnpm typecheck` passes but `next build` fails on this, because X" is worth
writing precisely because no check catches it.

## Section routing, worked through

| Observation | Section | Why |
|---|---|---|
| `Promise.all` over imported files OOMs at ~200 files; `p-limit` at 8 is stable | What Doesn't Work | it's a failing approach with its replacement |
| SSE handlers must register before module plugins or the stream 404s | Codebase Patterns | it's the shape of the app, not a bug |
| `relation "reviews" does not exist` → run `pnpm db:migrate` | Recurring Errors & Fixes | the next agent arrives holding the error string |
| Chose pgvector over a separate vector store to keep one datastore | Decisions | a choice with a reason, and an alternative not taken |
| Playwright `webServer.reuseExistingServer` hides a stale build in CI | Tool & Library Notes | it's the tool behaving unexpectedly |

When an entry could be "What Doesn't Work" or "Recurring Errors & Fixes", ask
whether the reader arrives with an *approach* or with an *error message*.

## Refining an earlier entry

Existing:

```
- **2026-06-12** — Batch imports over ~200 files OOM the indexer; cap concurrency at 8 — `server/src/modules/repo-intel/indexer.ts:140`
```

New finding — the real limit is file size, not count. Append, don't edit:

```
- **2026-08-01** — Refines 2026-06-12: the indexer OOM is driven by total bytes, not file count — a 40-file repo of generated bundles blows the same limit. Cap on bytes read, not on file count — `server/src/modules/repo-intel/indexer.ts:140`
```

The old line stays. A reader needs to see that the understanding changed, and when.

## A whole wrap-up, end to end

Session: SSE review stream dropped events under load in `server`.

Candidates considered, and the verdict on each:

1. "Debugging SSE is hard." — dropped, fails gate 1 and 3.
2. "Added a test for the stream." — dropped; the test is in the diff, and the
   diff is not an insight.
3. "Bumped `fastify` patch." — dropped, trivial.
4. Kept → `Recurring Errors & Fixes`:
   `- **2026-08-01** — Reviews stop mid-stream with no error when the client reconnects: the SSE plugin keys handlers by request id, so a reconnect orphans the old handler. Key by review id — \`server/src/platform/sse.ts:64\``
5. Kept → `Open Questions`:
   `- **2026-08-01** — Unclear whether the orphaned handler also leaks the Postgres listener; not reproduced under 50 concurrent streams.`

Two entries from a two-hour session is a healthy ratio. Ten would mean the gate
wasn't applied.
