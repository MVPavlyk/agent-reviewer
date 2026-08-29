# Fan-out ledger

Measured cost/time of parallel-worktree feature builds. One row per fan-out run.
Compare **measured** quantities (summed agent tokens, wall-clock to a green merge,
human review time, rerun count, overlap window, merge conflicts) — never
"parallel tokens" vs an imagined sequential estimate.

| Date | Fan-out | Agent tokens (out) | Wall-clock → green merge | Human review | Reruns | Overlap window | Merge conflicts |
|---|---|---|---|---|---|---|---|
| 2026-08-25 | A: Multi-Agent Review ∥ B: Export to CI | **A ≈ 1.24M** · B _pending_ | A ≈ single working session; exact ts not metered | low (≈8 decision points, no line review) | 3 (A) | WP1-fix ∥ WP2 (real) | 4 (expected) |

> B-side (`feat/export-to-ci`) numbers are **pending** — they live in the separate
> session that built worktree B and were not available when this row was written.
> Fill in from that session's transcript (`workflow-retro`) to complete the comparison.

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
