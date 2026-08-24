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

---

## 2026-08-23 — eval-pipeline (SPEC-05), 22 dispatches, 3.1M+ subagent tokens

**Turns, not tokens, predict a truncated dispatch — the cliff is ~135-145 turns.** Measured across
14 `implementer` calls: 145 turns truncated, 143 truncated, 137 survived by one tool call, 136
truncated; while 118 and 109 finished cleanly. Token count did not predict it — a 199k dispatch
lived and a 160k one died. Budget implementer calls in **turns**, and treat any call likely to
exceed ~120 as one that must be split, regardless of how few steps it carries. A step that creates
a component *plus* its test file is worth ~2 ordinary steps.
→ proposed for `sdd` §3.1: size calls by expected turns, cap at ~120, and count test-file creation
as a separate step-weight.

**An output-bound agent truncates at a completely different limit than a tool-bound one.**
`implementation-planner` died at **61 turns** producing a 111-row coverage table, while implementers
ran to 145. When a dispatch's cost is in what it *writes* rather than what it *reads*, split by
output section up front — for a plan, "spec half A" and "spec half B", each emitting its own §1a.
Recovering a truncated plan through three `SendMessage` resumes cost about as much as the original
attempt.
→ proposed for `sdd` §3: split planning when the spec carries more than ~60 AC/EC, the same
threshold already applied to `plan-verifier`.

**A coverage table proves an ID is present, not that the criterion survived intact.** `AC-46`
("four tiles — RECALL, PRECISION, CITATION ACCURACY, TRACES PASSED — each with a delta") was
compressed in §1a to "RTL: 4 tiles + list + button". Every mechanical check passed: the ID was in
the table, the step existed, the test was green. The implementer executed the plan faithfully and
the criterion was still lost. ID-set diffing catches omission; it cannot catch paraphrase.
→ proposed for `implementation-planner`: §1a rows must carry the criterion's *discriminating
detail* (names, counts, negative conditions), not a restatement of the step title.

**Grepping for a symbol is not evidence that the symbol is wired.** A fix was signed off because
`grep "metricRowText"` returned a hit — the function existed, was never called, and rendered
nothing. It survived `tsc` (no `noUnusedLocals` in that package), survived the test suite (the test
asserted other criteria and merely *mentioned* the field in a fixture), and survived the
orchestrator's own confirmation. When verifying a fix, grep for the **call site** or assert the
rendered behaviour; a declaration proves only that someone wrote a helper.
→ proposed for `plan-verifier` and for `sdd`'s post-fix confirmation: a "готово, коли" phrased as
"function X exists" is not acceptable; it must name a call site or an observable behaviour.

**A truncated dispatch is most dangerous when it dies during its own verification step.** The fix-1
call stopped at "now let's move to Step 5" — all five steps' edits were on disk, so the work
*looked* complete, but the check the plan demanded for step 5 never ran. Treat "truncated" as
"unverified", not as "unfinished": re-run the plan's done-conditions yourself rather than inferring
completeness from file state.

**Hand a fresh agent the current state, not the report that motivated the task.** `test-writer` was
given the iter-0 verifier reports as its work list and declared six already-fixed criteria to be
live production bugs, refusing (correctly, for its stale premise) to write tests for them. Reports
name what to look at; they are not a statement of what is still true two dispatches later.
→ proposed for `sdd` Phase 7: hand `test-writer` the parked list **plus** an explicit line that the
fix loop has closed and the code is the authority.

**Splitting calls to avoid truncation removes shared memory, and duplication is the tax.** Steps 16
and 17, in separate cold dispatches, each wrote their own `versionLabel`/`passLabel`; step 18 became
the third consumer and promoted them to a shared module. The anchors passed forward listed only the
*new* exports of the feature; nothing told call N what call N-1 had already built that it could
reuse.
→ proposed for `sdd` §4: the carried-forward anchor block should include reusable helpers created by
previous calls, not just their entry points.

**Narrow fix plans were the cheapest, cleanest dispatches of the run.** fix-plan-2 (2 steps) and
fix-plan-3 (1 step) cost 98,846 and 95,933 tokens at 47 and 45 turns, both returning complete
reports — against a 14-call implementer average well above that. Both named file, line, mechanism
and a falsifiable done-condition, so no turns went to discovery. The general shape holds beyond fix
loops: a dispatch that has to *find* its target costs multiples of one that is *given* it.

**Prompt size is negligible; dispatch scope is everything.** All 22 prompts together were 87,627
characters (~22k tokens, 0.7 % of the run). The single largest prompt — a hand transcription of six
mockups into `spec-creator` — was also the highest-leverage, because no later agent had to re-derive
the design. Do not economise on instructions; economise on how much work one dispatch must carry.
