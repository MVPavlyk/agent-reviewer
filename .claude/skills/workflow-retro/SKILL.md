---
name: workflow-retro
description: Post-mortem of a multi-agent workflow run itself — not of the code it produced. Measures what the run cost (tokens per agent and for the orchestrator, dispatch count and order, tool calls, wall time) from the session transcripts, then reads the run's artefacts to find where agents struggled, what they re-derived, which context was handed to them twice, and which findings only one reviewer caught. Produces a run report plus durable, generalizable lessons for the agent definitions and the pipeline. Use after an `/sdd` run or any orchestration that dispatched several subagents, and on "як пройшов прогін", "how did that run go", "retro on the workflow", "why did that run cost so much", "what should the agents do differently", "/workflow-retro". Always about a run that has already finished — it studies a pipeline, it never runs one, so a request to build or drive a feature through the pipeline is `sdd` instead. Manual only — never automatically. It never edits agent definitions or skills, never writes package INSIGHTS.md (that is `engineering-insights`), never documents the feature (that is `feature-docs`), and never reviews the diff (that is `pr-self-review`).
---

# Workflow Retro

A run of `/sdd` costs more than the feature it builds. This skill asks whether
that price bought anything: where the tokens went, which agent did the work,
which one re-derived what another had already established, and what the agent
definitions should say differently next time.

**Subject of study: the run, not the code.** A bug in the shipped feature is out
of scope here — it belongs to `/code-review`. A lesson about *how the pipeline
found (or missed) that bug* is exactly what belongs here.

## When to use

- After an `/sdd` run, a fix loop, or any turn that dispatched several subagents.
- On "як пройшов прогін", "retro on the workflow", "why did that cost so much",
  "what should the agents do differently", "/workflow-retro".
- After a run that went **badly** — an escalation, a truncated agent, a
  contradiction between reviewers. Those runs carry the most signal.

## When NOT to use

- **Never automatically.** It reads transcripts and costs real tokens.
- A single-agent task. There is no orchestration to study.
- To capture an engineering fact about the codebase → `engineering-insights`.
- To document the feature → `feature-docs`.
- To review the diff → `pr-self-review` or `/code-review`.

---

## Phase 1 — Measure. Never estimate.

Numbers come from the transcripts, not from memory and not from the task
notifications you happen to still have in context. An orchestrator's recollection
of "about 200k" is worthless in a report someone will act on.

```bash
python3 .claude/skills/workflow-retro/scripts/collect_metrics.py \
  --session <session-id> --scratch <scratchpad-dir>
```

`--auto` picks the newest transcript for this project when the session id is
unknown. `--json` emits the same data machine-readably.

**The one rule that matters here: never read a transcript into your context.**
The main session JSONL is megabytes and the per-agent ones are hundreds of
kilobytes each. The script exists precisely so that only its aggregate output
crosses into context. Reading `tasks/*.output` directly will blow the window and
teach you nothing the script did not already extract.

What the script reports, all measured:

| Metric | Source |
|---|---|
| Orchestrator turns, output/thinking tokens, cache read vs write | `message.usage` on every assistant record |
| Dispatch count, **order**, agent type, background flag, prompt size | `Agent` `tool_use` records, in transcript order |
| Per-agent tokens, tool calls, wall time | task-notification `<usage>` blocks, deduped by task-id |
| Per-agent turns and tool mix | that agent's own `tasks/<id>.output` transcript |

Two traps already encoded in the script, both found the hard way:
- Notification blocks repeat; summing regex hits **double-counts**. Dedupe by task-id.
- Claude Code slugifies the cwd by replacing `/` **and `.`** with `-`. Miss the dot
  rule and any path with a dot in it silently reports "no transcript found".

If the tasks directory is gone (scratchpads are transient), say so — per-agent
turn counts are simply unavailable for that run. Do not substitute a guess.

## Phase 2 — Read the artefacts, not the transcripts

For an `/sdd` run everything qualitative is already on disk in
`.devdigest/sdd/<slug>/`: `state.md`, `40-impl/*.md`, `50-review/*.md`,
`60-fix/*.md`. These are small, written for handoff, and each one already
declares its own deviations.

Harvest, per agent:

- **Self-declared deviations** — every implementer report has them. A deviation
  that later proved right is a defect in the *plan*, not the agent.
- **Turn-budget truncations** — an agent that returned an internal note instead
  of a report. Where was the boundary, and was the call scoped too wide?
- **Findings by reviewer** — which reviewer caught what. A finding only one
  reviewer could have caught justifies that reviewer's existence; a finding both
  produced is duplicated spend.
- **Fix-loop convergence** — findings in vs out per iteration, from `state.md`.
- **Escalations** — what the orchestrator had to hand back to the human, and
  whether an agent could have resolved it with a better prompt.

## Phase 3 — Answer five questions, with evidence

Each answer names a file, a line, or a number. An answer that cannot be
evidenced is labelled as inference.

1. **Where did the money go?** Tokens by agent type, orchestrator share, and the
   single most expensive dispatch. Note cache read vs write — a large cache read
   is cheap reuse, a large cache *write* is fresh context being paid for.
2. **What was hard?** Agents that needed several attempts, ran long, hit their
   budget, or asked blocking questions.
3. **What was easy?** Steps that passed first time. These are candidates for
   *merging* into fewer dispatches — orchestration overhead you can stop paying.
4. **What was duplicated?** The same file read by three agents; the same context
   pasted into successive prompts; two reviewers reporting one finding; an agent
   re-deriving a fact an earlier report already stated. Compare `prompt_chars`
   across dispatches — a growing prompt usually means pasted bodies where a path
   would do.
5. **What was missed?** Findings that appeared late (in a fix loop, or from a
   human) and *could* have been caught earlier. For each: which agent should
   have caught it, and what in its definition would have made it do so.

## Phase 4 — Write it down, in two places

**Run report** → `.devdigest/sdd/<slug>/95-retro.md` (or
`.devdigest/retro/<date>-<slug>.md` when the run had no `/sdd` folder). Holds
the measurements and this run's narrative. Disposable, like the rest of the run
folder.

**Durable lessons** → append to `.claude/agents/RETRO.md`, dated, append-only,
one entry per generalizable lesson. Only what would change a *future* run goes
here: a scoping rule, a prompt-shape fix, a missing handoff, a wrongly-drawn
agent boundary. This run's incident details stay in the run report.

Keep the two apart deliberately. "The client verifier hit its budget on 117 IDs"
is a run fact. "A verifier dispatch covering more than ~60 acceptance criteria
truncates — split by spec" is a durable lesson.

### What this skill must NOT do

- **Never edit `.claude/agents/*.md`.** Retro *proposes*; changing an agent's
  contract is a human decision (and `agents-curator` owns the README sync).
- **Never edit the `sdd` skill or any other skill.** Same reason.
- Never write package `INSIGHTS.md` — different subject, different owner.
- Never fabricate a number, and never present a reported figure as measured.
  The script separates the two; keep them separate in prose.
- Never grade the *feature's* correctness. Wrong subject.

## Report shape

```markdown
# Workflow retro — <slug>, <date>

## Cost
<the script's table, verbatim — measured>
Headline: N dispatches, M agent types, X tokens across agents, Y in the orchestrator.

## Dispatch order
<sequence, with what each produced; mark parallel pairs and re-dispatches>

## Per agent
### <agent-type> — N dispatches, X tokens
- Did well: …
- Struggled with: … (evidence)
- Was handed context it did not need / had to re-derive: …

## Duplicated effort
## Missed, and by whom
## Escalations to the human
## Durable lessons → RETRO.md
1. … (why, and what would change)
```

Lead with the table. A retro nobody reads changes nothing, and the numbers are
the part that survives skimming.
