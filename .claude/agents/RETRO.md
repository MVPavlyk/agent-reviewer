# Agent & pipeline retro log

Durable, generalizable lessons about **how the multi-agent pipeline runs** —
scoping rules, prompt shape, handoffs, agent boundaries. Append-only, dated,
newest last. Run-specific incidents stay in that run's `95-retro.md`.

Not the place for engineering facts about the codebase — those go to a
package's `INSIGHTS.md`. Not the place to change an agent's contract either:
entries here *propose*; editing `.claude/agents/*.md` is a human decision.

---

## 2026-08-22 — project-context (`/sdd`, 15 dispatches, 2.09M agent tokens)

**Cost lives in turns, not in prompt size.** All 15 dispatch prompts together
were 54,568 chars (~14k tokens) — 0.7% of the 2,094,800 the agents spent. Turns
are the driver at roughly 1.6k tokens each. Trimming instructions buys nothing;
preventing a truncation, or removing a reason to re-grep, buys a lot. Anyone
optimizing this pipeline should start from turn counts, not from prompt text.
→ applied as `sdd` cost rule 6.

**Turn ceilings are not uniform across agent types.** `implementer` completed
runs at 64-122 turns and truncated at 139; `plan-verifier` truncated at **85** —
earlier than an implementer that finished at 122. Do not carry one agent's safe
turn budget over to another, and do not assume a dispatch that "looks smaller"
has more headroom.
→ `implementer` now carries measured numbers instead of the unusable
"80% of `maxTurns`", which an agent cannot compute because it cannot read
`maxTurns`. Other agents still lack a measured figure.

**A step is a bad unit for sizing an implementer call.** One step cost 64 turns;
four steps cost 139 and died mid-work. Steps vary 20-35 turns depending on how
many files they create. Budget ~3 steps, never more than 4, and fewer for
file-heavy UI work.
→ applied as `sdd` §3.1.

**Split a verifier by spec before it truncates, not after.** One dispatch given
117 `AC-`/`EC-` IDs died without a report; the same work split by spec finished
at 41 and 62 turns. The failed dispatch is a total loss — its findings are gone
and the caller cannot tell how far it got.
→ applied as `sdd` Phase 5: split at >1 `Spec ID` or >~60 IDs.

**Fresh agents burn their budget re-greping for anchors earlier reports knew.**
`Bash` dominates every downstream agent's tool mix — a verifier spent 48 shell
calls against 2 file reads. The information existed; it just was not handed over.
→ `implementer` reports now end with `## Якорі` (`path:line` + a few words), and
`sdd` carries that section into the next prompt. Cheapest saving available.

**The coverage table is a claim, not evidence.** The plan's §1a listed EC-17 as
covered by two steps; the code implemented neither. It survived the planner,
three implementers and every implementation report, and was caught only because
a verifier grepped for the config constant instead of trusting the table.
Checking "claimed coverage vs code" deserves to be an intrinsic, named step of
`plan-verifier` rather than something a caller has to request.
→ applied as `plan-verifier` spec-coverage step 5: confirm the mechanism a
criterion names, not just the status of the step it maps to.

**A fix that closes a defect class on some entry points is not done.** Fix plan 1
enforced the roots check on the write path and the run path; a third reader
(`getContent`) kept its own copy of the old validation and was missed. When a
fix establishes an invariant, the natural follow-up question is which *other*
call sites touch the same resource.
→ applied as `architecture-reviewer` "When a change establishes an invariant,
check every entry point" — find the other callers by the resource, not the diff.

**Negative criteria need explicit re-verification when a fix edits their file.**
AC-22 and AC-47 survived only because the re-verification prompt asked for them
by name. A negative criterion fails silently: the test stays green and simply
stops proving anything.
→ applied as `plan-verifier` "Re-verifying after a fix": re-check passing
criteria in edited files, and negative criteria by name, on its own initiative.

**Both reviewers earned their slot; neither duplicated the other.** Every finding
was unique to the agent that raised it. `architecture-reviewer` was the cheapest
agent in the run (74,250 tokens / 23 turns on re-review) and produced the finding
no verifier saw — plus it overturned the orchestrator's own stated hypothesis
about a race, with line evidence. Consider dispatching it earlier than the end of
implementation, where its findings are cheapest to act on.
→ applied as `sdd` §4.1: one background, scoped architecture check as soon as a
package's structure exists, without blocking Phase 4.

**Per-agent transcripts are transient.** They live in a `/private/tmp`
scratchpad that is deleted without warning; the main session transcript survives
in `~/.claude/projects/`. A retro run after the scratchpad is gone can still
report session totals but has lost every per-agent breakdown.
→ `sdd` now writes a dispatch ledger into `state.md` as the run proceeds, and
offers `workflow-retro` at close-out rather than leaving it to be remembered.
