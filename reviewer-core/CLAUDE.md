# @devdigest/reviewer-core

Pure review engine: diff → prompt → LLM → grounded findings.

## Invariant — do not break
No DB, no HTTP, no filesystem, no env reads. The **only** side effect is a call
through the injected `LLMProvider` — that is what makes the engine mock-testable.
An import of db/fs/fetch here silently destroys the design.

This package has **no `src/vendor/`**. Shared types resolve to
`../server/src/vendor/shared` via tsconfig `paths`. Never create a local copy.

## Read when
| Trigger | Read |
|---|---|
| prompt assembly, grounding, or the run pipeline surprise you | [README.md](./README.md) — pipeline diagram + public API |
| behaviour is non-obvious / mid-debug | [INSIGHTS.md](./INSIGHTS.md) |

## Commands
**npm, not pnpm** (`package-lock.json`). `npm test` (vitest, hermetic, stubbed
`LLMProvider`, no network). `npm run typecheck` doubles as the build — the
package never emits JS.

## Conventions
- Grounding is mandatory: a finding that doesn't cite a real diff line is
  dropped by `groundFindings()`. Never bypass it to "keep" a finding.
- The score is recomputed deterministically from the **surviving** findings —
  never trust a score the model returned.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`) are fed by later
  course lessons. When a slot has no input, `assemblePrompt` omits its section
  entirely — don't render an empty heading.
