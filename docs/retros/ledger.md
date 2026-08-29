# Fan-out ledger

Measured cost/time of parallel-worktree feature builds. One row per fan-out run.
Compare **measured** quantities (summed agent tokens, wall-clock to a green merge,
human review time, rerun count, overlap window, merge conflicts) — never
"parallel tokens" vs an imagined sequential estimate.

| Date | Fan-out | Agent tokens (out) | Wall-clock → green merge | Human review | Reruns | Overlap window | Merge conflicts |
|---|---|---|---|---|---|---|---|
| 2026-08-25 | A: Multi-Agent Review ∥ B: Export to CI | **A ≈ 1.24M · B ≈ 2.97M** (Σ ≈ 4.2M) | per-side single working session; exact ts not metered | low (no line review) | 3 (A); resumes present (B) | WP1-fix ∥ WP2 (A, real) | 4 (expected) |

> Both sides now filled from their session transcripts. A-side measured live in
> the merge/CI session; B-side (`feat/export-to-ci`) recovered from its session
> transcript (`~/.claude/projects/…-devdigest-ci/9b3fc9a8-….jsonl`). Numbers are
> **output tokens** summed per subagent completion; orchestrator tokens excluded.

## A-side detail (worktree A — Multi-Agent Review)

Source: per-subagent `usage` reported by each dispatch in the build session. Figures
are **output tokens** and wall-durations of each subagent; the orchestrator's own
tokens are not separately metered here (a full `workflow-retro` pass would add them).

| Agent (dispatch) | Output tokens | Duration |
|---|---|---|
| spec-creator | 108,075 | ~8.9 min |
| implementation-planner | 125,398 | ~8.4 min |
| implementer WP1 (server, incl. grouping fix, cumulative) | 235,222 | ~14.7 min |
| implementer WP2 (client core, incl. resume, cumulative) | 270,951 | ~21.9 min |
| implementer WP3 (trace promote + PR picker) | 188,404 | ~9.4 min |
| implementer — run history addition | 146,693 | ~10.7 min |
| architecture-reviewer (scoped) | 65,163 | ~2.7 min |
| plan-verifier (structural) | 102,772 | ~6.1 min |
| **Total (A)** | **≈ 1,242,678** | — |

Notes on the measured qualitative metrics:
- **Reruns (3):** WP2 stopped mid-step and was resumed once; WP3's completion report
  was truncated so the result was self-verified by re-running the client suite;
  a `rationale` defect found by plan-verifier was fixed and re-verified after review.
- **Overlap window:** the WP1 grouping fix ran concurrently with WP2 (client core) —
  a genuine parallel window (server vs client, no file overlap), not sequential.
- **Merge conflicts (4, all expected):** `server/src/modules/index.ts` (module
  registry), `client/src/vendor/ui/nav.ts` (GLOBAL nav section), migrations
  (`_journal.json` + `0019` collision → B regenerated as `0020` via `db:generate`),
  and `client/src/lib/hooks/index.ts` (auto-merged). Resolved keep-both / regen.
- **Not metered precisely:** absolute wall-clock start→merge and human review minutes
  (no line-by-line human review; decisions were made at ~8 checkpoints). $-cost omitted
  deliberately — no fabricated per-token rate; tokens are the measured unit here.

## B-side detail (worktree B — Export to CI)

Source: the B session transcript
(`~/.claude/projects/-Users-oyi-21-11-00075-WebstormProjects-devdigest-ci/9b3fc9a8-56e7-4c68-b61b-ed941259bee7.jsonl`),
summing the `subagent_tokens` / `duration_ms` reported by each subagent completion
(deduped — each task-notification is recorded twice in the transcript).

- **Subagent dispatches:** 21 (spec + planner + ~8–9 implementer passes + reviews +
  security + fixes — B was a larger fan-out than A).
- **Output tokens (Σ):** ≈ 2,967,206 (~2.97M).
- **Cumulative subagent wall-time:** ≈ 160.5 min (sum of per-agent `duration_ms`; not
  wall-clock, since dispatches overlapped).
- **Caveat:** a resumed agent reports a *cumulative* figure on each stop, so a
  resume's base pass may be counted twice; 2.97M is therefore a mild **upper bound**,
  not an exact floor. A full `workflow-retro` (grouping by agent id, final-value-per-agent)
  would tighten it. Same methodology gives A ≈ 1.24M over 8 dispatches.

**Combined fan-out (A + B):** ≈ 4.2M output tokens across 29 subagent dispatches.
