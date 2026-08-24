---
name: sdd
description: "Runs this repository's full Spec Driven Development pipeline end to end from one invocation: normalizes whatever inputs it was given (an existing specs/**/SPEC-NN file, free-text requirements, Figma links, local mockup images, or any combination) into a single spec, then drives spec-creator → researcher → implementation-planner → implementer → plan-verifier(structural) ∥ architecture-reviewer → bounded fix loop → test-writer → plan-verifier(full), persisting every artefact to .devdigest/sdd/<slug>/ so phases hand each other file paths instead of pasted text. Owns the fix loop that architecture review and structural verification feed: it merges their blocking findings into a numbered fix-plan addendum, re-dispatches implementer against it, re-reviews only the touched files, and escalates to the user instead of looping forever. Use on '/sdd', 'запусти SDD', 'прогони фічу по пайплайну', 'зроби фічу за специфікацією', 'зроби фічу від спеки до тестів', or whenever a whole feature — not a one-line fix — is about to be built from requirements or a design and the user wants it carried through review and tests rather than just implemented. Not for a small single-file change, where the orchestration costs more than the work: run implementation-planner alone and take the single-agent mode it offers. Manual only — never start it automatically. It is an orchestrator with no domain knowledge of its own: it dispatches the .claude/agents/ subagents rather than doing their work, and it never writes application code itself. Does not replace pr-self-review (pre-PR gate on an existing diff), does not open or merge a PR, and does not write INSIGHTS.md or feature docs."
metadata:
  tags: sdd, orchestration, pipeline, spec, plan, implement, review, fix-loop, process
---

# SDD Run

One invocation, one feature, the whole pipeline. This skill is a **conductor**:
every piece of judgment belongs to a subagent in `.claude/agents/`, and this
file only decides what runs, in what order, with what input, and when to stop
and ask a human.

Read `.claude/agents/README.md` once at the start of a run if you have not
already — it holds the pipeline's rationale (why the verifier runs twice, why
architecture review precedes `test-writer`). Do not restate agent behaviour
here; dispatch and let the agent's own prompt govern it.

## When to use

- The user invokes `/sdd`, "запусти SDD", "прогони фічу по пайплайну", "зроби
  фічу за специфікацією".
- There is a feature to build end to end, not a one-line fix.

## When NOT to use

- **A small, single-file change.** The orchestration overhead exceeds the work.
  Plan it directly, or run `implementation-planner` alone and pick the
  single-agent execution mode it offers.
- **Reviewing a diff that already exists** — that is `pr-self-review`.
- **Never automatically.** This skill spends a lot of tokens and makes many
  file changes. It starts only when a human asks for it by name.

---

## Phase 0 — Intake

### 0.1 Parse the invocation

```
/sdd <вимоги вільним текстом>
/sdd specs/server/SPEC-07-blast-radius.md
/sdd specs/server/SPEC-07-blast-radius.md  плюс: додати експорт у CSV
/sdd <вимоги>  https://www.figma.com/file/...
/sdd <вимоги>  ./designs/pulls-empty-state.png
/sdd --resume
/sdd --from=implement
/sdd --max-fix-iters=2
/sdd --dry-run
```

Classify every argument into exactly one bucket. Do not guess — an argument
you cannot classify is a question for the user, asked now, before anything
expensive runs.

| Bucket | Recognised by | Goes to |
|---|---|---|
| Existing spec | a path matching `specs/**/SPEC-*.md` that exists on disk | Phase 1 as the base document |
| Requirements | free text | Phase 1 |
| Figma design | a `figma.com` URL | Phase 1 (`spec-creator` has `WebFetch`) |
| Local design | a path to `.png`/`.jpg`/`.pdf` that exists | Phase 1 as a path — `spec-creator` can `Read` an image |
| Pasted design | an image pasted into *this* conversation | see 0.2 — **this one needs work before it can be forwarded** |
| Flag | `--resume`, `--from=`, `--max-fix-iters=`, `--dry-run` | this skill |

### 0.2 The pasted-image trap

An image pasted into this conversation exists in **your** context, not on
disk, and a subagent starts with an isolated context — you cannot forward it
by mentioning it in a task prompt. `spec-creator` will silently receive
nothing and write a spec with no design analysis. Handle it explicitly:

1. Ask the user to save it and give you a path — best outcome, `spec-creator`
   then reads the real pixels.
2. If they cannot, **you** transcribe it: write a dense, factual description
   into `<run>/00-inputs/design-notes.md` — every element, state, label,
   affordance, and everything the mockup does *not* show — and hand
   `spec-creator` that path, saying plainly that it is a transcription, not
   the design. It must treat gaps in the transcription as gaps, not as
   absences in the design.

Never pretend an image was analysed when only its filename crossed the
boundary.

### 0.3 Create the run folder

```
.devdigest/sdd/<slug>/
  state.md                 ← phase checklist + run parameters + dispatch ledger;
                             the resume anchor
  00-inputs/               ← requirements.md, design-notes.md, arg classification
  10-spec.md               ← copy of / pointer to the SPEC in specs/**
  20-research/             ← researcher reports, one file per dispatch
  30-plan.md               ← the approved plan (also copied to .devdigest/plans/)
  40-impl/                 ← implementation reports, one per implementer call
  50-review/               ← verifier + architecture reports, per iteration
  60-fix/                  ← fix-plan-1.md, fix-plan-2.md, …
  70-tests.md              ← test-writer report
  90-final.md              ← the run summary
```

`<slug>` is the feature in kebab-case. Write `state.md` **first**, with every
phase unchecked and the parsed inputs recorded — a run that dies mid-way is
resumable only if this file exists before the expensive work starts.

Give it a dispatch ledger from the outset, and append one line per subagent as
each finishes:

```markdown
## Dispatch ledger
| # | agent | what | tokens | tools | dur s | outcome |
|---|---|---|---|---|---|---|
| 1 | spec-creator | SPEC-01/02 | 168868 | 43 | 733 | ok |
| 7 | implementer | steps 11-14 | 210232 | 80 | 698 | TRUNCATED — step 13 lost |
```

Artifacts are working files, like `.devdigest/self-review/`. Add
`.devdigest/sdd/` to `.gitignore` if it is not there. The **plan** is the
exception: copy the approved plan to `.devdigest/plans/<slug>.md`, which this
repository tracks.

### 0.4 The file-path rule — the single biggest cost lever

Phases hand each other **paths**, never pasted bodies. A plan pasted into an
implementer prompt, then again into a verifier prompt, then again into a fix
prompt is the same tokens bought three times, and `implementer`'s own prompt
already says it expects a path to `Read`. The only things that travel as text
between phases are: a file path, a step number, a finding ID, and one line of
context.

### 0.5 `--dry-run`

Do Phase 0 only. Print the plan of the run — phases, which agents will be
dispatched, how many implementer calls the work will likely split into, which
gates will stop for a human — and stop. Nothing is written except `state.md`
and `00-inputs/`.

---

## Phase 1 — Spec

**Everything becomes spec first.** If the user supplied a spec *and* extra
requirements, the extras do not travel alongside it — they go **into** it, via
`spec-creator` in update mode. A requirement that never entered the spec never
gets an `AC-` ID, never lands in the plan's §1a coverage table, and is never
verified. That leak is the one failure this pipeline exists to prevent.

| Situation | Action |
|---|---|
| No spec, only requirements/designs | Dispatch `spec-creator`. It writes `specs/<package>/SPEC-NN-<slug>.md` |
| Spec supplied, nothing added | Skip the dispatch. Read it, record its `Spec ID` and `Status` in `state.md` |
| Spec supplied + extra requirements/designs | Dispatch `spec-creator` to **update** that file, naming exactly what to fold in |

`spec-creator` may come back with **blocking questions instead of a spec** —
that is correct behaviour, not a failure. Relay them to the user verbatim,
get answers, re-dispatch with the answers in the prompt. Never answer them
yourself.

### Gate 1 — the user approves the spec

Show: the file path, the `AC-`/`EC-` counts, the agent's `Open questions`, and
its UX proposals (which are proposals, not requirements — `spec-creator` is
forbidden from promoting them itself; if the user accepts one, it goes back
through `spec-creator` as an update, not into the plan by hand).

Ask the user to flip `Status: draft` → `approved`, or to tell you to proceed
with a draft. Record which in `state.md`. Do not continue without an answer.

---

## Phase 2 — Research (conditional)

Only when the spec or the coming plan depends on a fact nobody has
established: an external library/API behaviour, or a repo fact outside the
touched packages.

`implementation-planner` has no web access and cannot call `researcher`
itself — that is why this phase belongs to you. Skip it entirely when the
spec left no such gap; a `researcher` dispatch "to be thorough" is pure cost.

Dispatch **in parallel, one narrow question each** (`.claude/agents/README.md`
§"Scoping a research call" explains why a broad call burns its turn budget
before writing its report). Save each report to `20-research/<question>.md`
and hand the planner the paths.

---

## Phase 3 — Plan

Dispatch `implementation-planner` with: the spec path, the research report
paths, and the execution mode — **`мультиагентний пайплайн`, stated up front**.
The planner is required to block on that question if nobody answers it; you
are the caller and you already know the answer, so answering it in the opening
prompt saves a full round-trip per run.

**Split the planning dispatch when the spec carries more than ~60 `AC-`/`EC-`
IDs** — the same threshold Phase 5 applies to `plan-verifier`, for a different
reason. A planner is **output-bound**, not tool-bound: measured, one died at just
**61 turns** while producing a 111-row §1a coverage table, where implementers in
the same run ran to 145. Split by spec half (or by package), each dispatch
emitting its own §1a, and stitch the halves yourself. Recovering a truncated plan
through `SendMessage` resumes cost about as much as the original attempt.

The planner has no `Write` tool. It returns the plan as text; **you** save it
to `30-plan.md` and copy it to `.devdigest/plans/<slug>.md`.

Before the gate, check the plan yourself — mechanically, not editorially:

- §1 has a `Spec ID` line, and it matches the spec from Phase 1.
- §1a exists and lists **every** `AC-`/`EC-` that appears in the spec file.
  Grep both and diff the ID sets. A missing ID goes back to the planner now;
  catching it here costs one re-dispatch, catching it in Phase 8 costs a
  re-implementation.
- §5 (skill routing) and §6 (verification commands) are present.
- Every step has a falsifiable "готово, коли".

### 3.1 Split the plan into implementer calls

The planner does not do this and `implementer`'s own prompt asks the caller
to. Cut on **package and phase boundaries**, e.g. `vendor/shared` contracts +
DB schema → `reviewer-core` → `server` wiring → `client`. Order so the
repository typechecks between calls. Write the split into `state.md` as a
checklist — it is also the resume anchor for Phase 4.

**Size the calls in turns, not steps.** Step count is a poor proxy: measured on
real runs, a single step cost 64 turns while four steps cost 139 and died
mid-work. What actually correlates with cost is turns (~1.6k tokens each), and
a step averages 20-35 of them. So budget **≈3 steps, and never more than 4**,
per call — and fewer when the steps involve heavy file creation (a UI step with
5 new files burns turns faster than a config edit). A call that truncates costs
more than the split you avoided: you lose its report, and you cannot tell what
landed without going to disk yourself.

**The cliff sits at ~135-145 turns, and tokens do not predict it.** Measured over
14 implementer calls in one run: 145 turns truncated, 143 truncated, 137 survived
by a single tool call, 136 truncated — while a 199k-token call lived and a
160k-token one died. Treat **~120 turns as the budget** and split anything likely
to exceed it, however few steps it nominally carries. **A step that creates a
component AND its test file weighs roughly two ordinary steps** — three such steps
truncated three times in that run; two-step calls returned clean reports every
time. Say so in the dispatch prompt as well: an agent told "if you approach your
budget, stop and report what is done rather than truncating mid-file" does exactly
that, and a partial report costs far less than a lost one.

### Gate 2 — the user approves the plan

Show the path, the step count, the call split, and §7 (risks/open questions).
This is the last cheap moment to change direction.

---

## Phase 4 — Implement

For each call in the split, dispatch `implementer` with:

- the **path** to `30-plan.md` and the step numbers this call owns;
- a one-paragraph handoff: what the previous call landed (files, not prose);
- nothing else. Not the spec, not the research reports — the plan is
  self-contained by the planner's contract, and anything missing from it is a
  planner bug to fix, not a gap to paper over with extra context.

Save each report to `40-impl/call-<n>.md`. If a call reports it stopped near
its turn budget with steps remaining, start a **fresh** instance with a
handoff note rather than resuming the long one — a resumed context resends its
entire history every turn.

**Carry the previous call's `## Якорі` section into the next prompt**, verbatim
and as text — it is a handful of `path:line` lines, not a pasted body, so the
path-not-bodies rule still holds. Every fresh agent starts cold, and downstream
agents measurably burn 20-48 shell calls re-finding anchors that an earlier
report already named. This is the cheapest saving in the whole pipeline.

The anchor block must also carry **what earlier calls built that this one could
reuse** — shared helpers, formatters, predicates — not only the entry points of
the feature under construction. Splitting calls to dodge truncation removes the
shared memory that would otherwise prevent duplication: in one run two UI steps in
separate cold dispatches each wrote their own copy of the same two formatters, and
only the third consumer noticed and promoted them.

**Record the cost of each dispatch in `state.md` as it completes**: agent type,
tokens, tool calls, duration, from the task notification. Three numbers per
line. The per-agent transcripts live in a scratchpad under `/private/tmp` and
are deleted without warning, so a notification you do not write down is gone —
and with it any chance of `workflow-retro` telling you where the run's money
went.

If `implementer` reports a **blocker** (a plan step that is impossible, two
steps that contradict), stop the phase. A blocker is a planner problem: go
back to Phase 3 with the blocker text, not forward.

**A truncated dispatch is "unverified", never "unfinished".** The most expensive
failure of one measured run was a call that died at "now let's move to Step 5" —
every edit was already on disk, so the work *looked* complete, and the check its
own plan demanded for that step never ran. When a dispatch truncates, re-run the
plan's "готово, коли" conditions yourself instead of inferring completeness from
file state. And verify them the right way: **grep for the call site, not the
symbol.** `grep "someHelper"` returns a hit whether the function is wired into the
render path or sitting there dead — in that same run a helper that computed exactly
what the criterion asked for was never called, passed `tsc` (no `noUnusedLocals`),
passed a green test that asserted other criteria, and was signed off by the
orchestrator on the strength of the grep alone.

### 4.1 — One early architecture check, as soon as a package's shape exists

After the call that first lays down a package's structure — the new module, the
schema, the contracts — dispatch `architecture-reviewer` scoped to just those
files, in the background, and carry on implementing while it runs.

It is the cheapest agent in the pipeline (measured: 74k tokens over 23 turns on
a scoped pass, against 130-220k for an implementer call), and it is the only one
that can tell you a module is wired into the wrong layer. Learning that after
five more calls have built on top of it is what makes the fix loop expensive:
the same finding costs one file to fix now and a cascade later.

Keep it genuinely scoped — the files that call just landed, not the run so far —
and do not block Phase 4 on the result. If it comes back with a CRITICAL, fold
it into the next implementer call rather than opening a fix loop mid-phase.

---

## Phase 5 — Review, in parallel

Dispatch both, **at the same time**, in one message:

- `plan-verifier` in **structural** mode — say so explicitly in the prompt,
  and give it: the plan path, the spec path, and the changed-file list. It
  runs typecheck only and parks test-dependent requirements under
  `## Очікує test-writer`.
  **Split it up front when the plan carries more than one `Spec ID`, or more
  than ~60 `AC-`/`EC-` IDs in total** — one dispatch per spec, each told which
  half is not its scope so the two do not overlap. This is not optional
  tuning: a single verifier handed 117 IDs died without a report, while the
  two halves of the same work finished in 41 and 62 turns. Splitting after it
  truncates costs you the whole first dispatch.
- `architecture-reviewer` — scoped to the changed files, not the repository.

They are both read-only, neither writes anything, and neither depends on the
other's output, so serialising them buys nothing but wall-clock. Save to
`50-review/iter-0-verifier.md` and `50-review/iter-0-architecture.md`.

`test-writer` does **not** run yet. Architecture review is the one pass that
can demand a file move or an adapter rewiring, and that invalidates every
import in a test written beforehand.

---

## Phase 6 — The fix loop

This is the part that needs discipline: two reviewers produce findings, the
only agent allowed to change code is `implementer`, and `implementer` is
forbidden from working outside a plan. So findings do not go to it as
findings — they go as a **plan**.

### 6.1 Triage into exactly three buckets

| Bucket | What lands in it | Action |
|---|---|---|
| **Blocking** | `architecture-reviewer` CRITICAL · `plan-verifier` FAIL · `plan-verifier` PARTIAL | Fixed this iteration. Non-negotiable |
| **Deferred** | `architecture-reviewer` WARNING | Fix **only** if it sits in a file this plan already touches and the fix is contained. Otherwise record in `90-final.md` under "не виправлено" with the reason |
| **Never** | `architecture-reviewer` SUGGESTION · anything under "Поза обсягом плану" | Never auto-fixed. Listed for the user, and that is all |

The temptation to sweep up SUGGESTIONs "while we're in there" is exactly the
scope creep `implementer`'s prompt forbids, and it is how a bounded loop
becomes unbounded.

### 6.2 Write a fix-plan, not a finding list

Write `60-fix/fix-plan-<n>.md` in `implementation-planner`'s own plan format —
numbered steps, exact files, the skills from the plan's §5 routing table for
those files, and a falsifiable "готово, коли" per step, phrased so that
satisfying it makes the finding disappear. Add a header naming the source
finding of each step (`← ARCH-CRITICAL-2`, `← VERIFIER-FAIL-4`), so the
re-review in 6.4 can be matched back to it.

Two findings on the same file become one step. A finding that needs a
**design decision** (two valid fixes, or a fix that contradicts the plan) does
not become a step at all — it goes to the user immediately, per 6.5.

If a fix-plan would exceed ~5 steps, the review found a structural problem,
not a set of defects. Stop and escalate rather than grinding through it.

### 6.3 Dispatch

`implementer`, with the **path** to `60-fix/fix-plan-<n>.md`. Same contract as
Phase 4: it executes a plan, it does not review, and it does not fix a finding
by weakening an assertion or deleting a test. Save to `40-impl/fix-<n>.md`.

### 6.4 Re-review — scoped, never from scratch

Re-dispatch **only** what the fix could have changed:

- `architecture-reviewer` on the files the fix touched — plus, if the fix
  moved a file or changed an import direction, its importers.
- `plan-verifier` (structural) on the plan steps the fix touched **and** the
  steps that previously PASSed in those same files. That second half is the
  regression guard: a fix that satisfies a CRITICAL by breaking a step which
  already passed is a net loss, and only re-checking the fixed steps would
  hide it.

Re-reviewing the whole change each iteration is the single easiest way to make
this loop cost more than the feature.

### 6.5 Convergence, and when to stop

Fingerprint every finding as `severity + path + rule`. Then:

- **A fingerprint survives its own fix iteration** → stop the loop. The fix
  did not work, or the finding is contested. Escalate with both texts side by
  side: what the reviewer says, and what the implementer did. Do not try a
  third phrasing of the same instruction.
- **A fix produces a new blocking finding** → that counts as an iteration and
  is fair game for the next one, but two consecutive iterations that each
  introduce new blocking findings mean the change is fighting the
  architecture. Stop and escalate.
- **Iteration cap: 3** (`--max-fix-iters` overrides). On exhaustion, stop —
  never silently continue, and never lower a severity to make the loop exit.
- **Clean pass** (no blocking findings from either reviewer) → the loop is
  done. Proceed to Phase 7.

Escalation is a normal outcome, not a failure. Write what stands, what was
tried, and the concrete choice you need from the user; then stop the run at
that point with `state.md` accurate enough to `--resume`.

### 6.6 Log every iteration

Append to `state.md` per iteration: blocking-finding count in, count out, new
fingerprints, files touched. Three lines. Without it, iteration 3 cannot tell
whether it is converging or circling.

---

## Phase 7 — Tests

Now, and not before. Dispatch `test-writer` with:

- the changed-file list;
- the path to `50-review/iter-<last>-verifier.md`, whose
  `## Очікує test-writer` section is precisely the list of requirements a test
  would settle — that section is written for this handoff;
- the spec path, so `AC-`/`EC-` IDs can be named in test descriptions.
  Traceability that survives into the test names is what makes the spec worth
  having six months later.

`test-writer` cannot touch production code (blocked by its own `PreToolUse`
hook). If it reports the code is untestable without a refactor, that is a
finding for the user or a new fix-plan step — not something to work around
with a weaker test. Save to `70-tests.md`.

---

## Phase 8 — Full verification

Dispatch `plan-verifier` in **full** mode: the plan path, the spec path, the
changed-file list. It re-runs the real suites as evidence and must return
`## Очікує test-writer` empty — anything still parked there is now a FAIL.

If it returns FAIL or PARTIAL, that re-enters Phase 6 as one more iteration,
counted against the same cap. It does not get a fresh budget just because it
arrived late.

---

## Phase 9 — Close out

Write `90-final.md` and show the user:

- spec path + Spec ID; plan path; the `AC-`/`EC-` coverage verdict from Phase 8;
- fix-loop summary: iterations used, findings fixed, findings deferred with
  reasons, anything escalated;
- the actual verification output from the full pass;
- **what nobody checked**: this pipeline has no bug/correctness review and no
  security review. `architecture-reviewer` covers boundaries only, explicitly
  not correctness. Say so plainly and offer `/code-review` for bugs and the
  `security` skill scoped to the changed files — offer, do not run them
  silently.

Then offer, each as a separate opt-in: `engineering-insights` (if the run hit
anything non-obvious — the fix loop usually does), `feature-docs`,
`pr-self-review` before a PR, and **`workflow-retro`**.

Offer `workflow-retro` **here and not later**, and say why when you offer it:
the per-agent transcripts it measures live in a `/private/tmp` scratchpad that
is deleted without warning, so a retro run tomorrow can still read the main
session transcript but has lost every per-agent breakdown. Worth offering after
any run that truncated a dispatch, needed more than one fix iteration, or
escalated — those carry the most signal about what the agents should do
differently. A short, clean run rarely justifies it.

This skill never commits, never pushes, and never opens a PR.

---

## Resume

`/sdd --resume` reads `state.md`, reports the last completed phase, and
continues from the next one. `/sdd --from=<phase>` jumps explicitly, for when
the user knows something upstream changed.

Re-entering a phase re-dispatches its agent from scratch — subagents keep no
state between calls. That is why the artefacts are files: `--from=review`
works because `30-plan.md` is still on disk, not because any agent remembers
it.

## Cost rules, restated because they are the whole design

1. Paths between phases, never pasted bodies.
2. Parallel where independent: researchers with each other; structural
   verification with architecture review.
3. Scoped re-review in the fix loop — touched files and their importers, plus
   the regression steps. Never the whole change.
4. Fresh implementer instance per package/phase boundary; never a long resumed
   one.
5. A bounded loop with a real escalation path beats an unbounded one that
   eventually gets it right.
6. Cost lives in **turns**, not prompt size. Measured on a full run: all 15
   dispatch prompts together were ~14k tokens — 0.7% of the 2.09M the agents
   spent. Shaving instructions saves nothing; splitting a call that would
   truncate, and naming anchors so the next agent stops re-greping, saves a lot.

## Forbidden

- Running automatically, or as part of another skill's wrap-up.
- Writing application code yourself. Every code change goes through
  `implementer` against a plan file.
- Answering a subagent's blocking question on the user's behalf.
- Promoting a `spec-creator` UX proposal into a requirement without the user.
- Skipping Gate 1 or Gate 2 because the input "looked complete".
- Lowering a finding's severity, or dropping it from the fix-plan, to make the
  loop terminate.
- Running `test-writer` before architecture review has come back clean.
- Committing, pushing, or opening a PR.
