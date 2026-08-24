---
name: feature-docs
description: Writes a standalone feature doc into root docs/features/<slug>.md — Status/Packages header, What (with links to the real files), Why, How, Known gaps, Out of scope. Manual only — never run this automatically at the end of a session (that's engineering-insights' job). Trigger only on an explicit ask — "document this feature", "write docs for X", "write it up like run-cost-badge", "/feature-docs" — never proactively.
---

# Feature Docs

One markdown file per shipped feature in root `docs/features/`, explaining
what it does, why it exists, and the non-obvious parts of how it works — for
a human (reviewer, new contributor, future-you) who wasn't in the session.

This is **not** [engineering-insights](../engineering-insights/SKILL.md).
Different audience, different trigger, different file:

| | engineering-insights | feature-docs |
|---|---|---|
| Runs | proactively, mid-session and at wrap-up | **only when explicitly asked** |
| Writes to | `<package>/INSIGHTS.md` | root `docs/features/<slug>.md` |
| Audience | the next agent, mid-task | a human, reading the feature cold |
| Shape | one-line dated anchored entries, append-only | one prose/bullet doc per feature, rewritten in place as the feature evolves |
| Content | gotchas, dead ends, decisions-in-isolation | the feature's full shape: what it does, why it was built, how the pieces fit |

If a session produced both — and most non-trivial features do — run
`engineering-insights` for the gotchas and `feature-docs` (this skill, on
request) for the feature write-up. Don't copy entries verbatim between them:
INSIGHTS entries are raw and package-scoped; a feature doc synthesizes across
packages into one coherent story. It's fine for the doc's "How" section to be
*informed* by an INSIGHTS entry without repeating its exact wording.

## When to run

**Only on an explicit request.** Signals: "document this feature", "write
docs for X", "write it up the same way you did for run-cost-badge",
"/feature-docs". Never run this proactively at task wrap-up, and never as a
substitute for `engineering-insights` — if the user just says "record what we
learned" without naming docs, that's the other skill.

Skip it for anything that isn't a genuine cross-cutting feature: a one-file
bugfix, a rename, a config tweak, a test-only change. If unsure whether the
just-finished work qualifies, ask rather than write a thin doc.

## Where the file goes

`docs/features/<kebab-case-feature-name>.md` — root-level, not inside any
package. (This is a third category the root `CLAUDE.md`'s "`docs/` means two
different things" section doesn't currently name — `docs/agent-prompts/` is
product content and `<package>/docs/` is package-scoped design notes; a
feature doc is neither. If `docs/features/` doesn't already have a mention in
root `CLAUDE.md`, say so and offer to add one — `CLAUDE.md` is human-owned, so
propose the edit, don't make it unasked.)

Filename mirrors the feature's natural name, not the ticket/PR title:
`run-cost-badge.md`, `findings-by-severity.md` — a thing a reader would
recognize, not "l01-lab" or "pr-482-followup".

**Updating an existing feature:** if `docs/features/<slug>.md` already exists
for the thing just extended (e.g. a follow-up session adds the hover popover
to an already-documented findings feature), update that file in place rather
than creating a second one — fold the addition into `What`/`How`, don't
append a changelog section.

## Template

```markdown
# <Feature Name>

**Status:** done — YYYY-MM-DD
**Packages:** <comma-separated: server, client, reviewer-core, e2e>

## What

<Bulleted list, one bullet per surface/entry point the feature is visible at.
Each bullet names the surface, what it shows, and links the primary file
responsible — relative path from docs/features/, e.g.
`([PRRow.tsx](../../../client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx))`.
This section answers "where do I see this and what does it look like" —
no implementation detail yet.>

## Why

<One short paragraph. The problem or gap that motivated the feature — not a
restatement of What. If the trigger was a specific pain point ("no way to
tell if a PR has anything critical without opening every accordion"), say
that. If it's a deliberate lab/exercise shape mirroring an earlier feature,
say that too.>

## How

<Bulleted, one bullet per non-obvious implementation decision — the things a
reader would otherwise have to reconstruct from a diff. Bias toward "why this
way and not the obvious way": a data-flow choice, a contract change and which
side is source-of-truth, a perf/correctness tradeoff, a reused vs. new
component decision. Skip anything a typecheck or the code itself already
makes obvious. Each bullet may reference a file, but this section is prose,
not a changelog — sentences, not diff summaries.>

## Known gaps

<Things intentionally left broken, inconsistent, or unaddressed — accepted
as-is, not a TODO list. If there's nothing, omit the section rather than
writing "none".>

## Out of scope (not built)

<Things a reader might reasonably expect from the feature name/mockup but
that were deliberately not built — and why (explicitly descoped in a
clarifying question, existing pattern left alone, etc). Omit if nothing was
descoped.>
```

`Known gaps` vs `Out of scope`: a gap is something the feature *should*
arguably cover but doesn't (a rough edge); out-of-scope is something outside
the feature's stated boundary from the start (an explicit non-goal). If
unsure which, `Known gaps` is the default.

## Sourcing the content — no invented facts

Everything in the doc must trace to code you've read or written in *this*
session, or the immediately preceding one if continuing a feature. Same
discipline as `engineering-insights`' anchoring rule:

- **What/How bullets** need a real file path — open the file to confirm the
  export/behavior still matches before citing it, don't cite from memory of
  an earlier message.
- **Why** may be a synthesis of what the user said plus what the code implies
  — but don't assert a design rationale nobody stated unless the code makes
  it unambiguous (e.g. a comment explaining the choice).
- If the session's diff/git log is the only source of truth (no chat context
  on *why*), say what changed and mark the *why* as inferred, don't guess a
  motivation.

## Style notes

- Keep it scannable: short bullets over paragraphs, except `Why` (one
  paragraph is correct there).
- Every file link is relative from `docs/features/` — `../../client/...` /
  `../../server/...`, matching how existing docs in this folder link.
- Don't restate obvious framework behavior (that's what the
  `.claude/skills/*-best-practices` skills are for) — only this feature's
  specific shape.
- Read at least one existing file in `docs/features/` before writing a new
  one, to match tone and section granularity — don't invent a new structure
  per doc.
