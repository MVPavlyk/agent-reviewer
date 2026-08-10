---
name: engineering-insights
description: Captures durable engineering insights into the touched package's INSIGHTS.md (client, server, reviewer-core, e2e). Use the moment something non-obvious lands mid-session — a cause that was surprising, a fix that took more than one attempt, a library/tool quirk, an approach that was tried and rejected, an architectural decision — and again when wrapping up any task that involved a problem, a decision, or a discovery. Also triggered by "record this", "add to insights", "what did we learn", "wrap up the session", "/engineering-insights". Append-only — it never rewrites or deletes existing entries.
---

# Engineering Insights

Write down what the next agent would otherwise re-learn the hard way, into the
INSIGHTS.md of the package that was touched. Append-only.

`CLAUDE.md` is the handbook (stable, curated by humans). `INSIGHTS.md` is the
running notes (evolving, appended by whoever hit the wall). Never move an entry
between them without being asked.

## When to run

**Two triggers — both matter.**

1. **Capture as you go.** The instant a discovery survives the quality gate
   below, append it. Do not batch it in your head — a discovery that isn't
   written before the next tool call usually isn't written at all.
2. **Wrap-up.** Before reporting a task complete, re-scan the session for
   anything missed and append it.

Run the wrap-up after any session that involved **a problem, a decision, or a
discovery**. Skip it for renames, formatting, dependency bumps that just worked,
and one-line config edits. Signal quality beats volume — an empty wrap-up is a
valid outcome, and saying "nothing worth recording" is better than padding.

## Which file

One entry goes into exactly **one** file — the package where the next agent will
hit the same wall. Never copy the same entry into two files.

| Work touched | Write to |
|---|---|
| `client/**` | `client/INSIGHTS.md` |
| `server/**`, including `server/src/modules/repo-intel/**` | `server/INSIGHTS.md` |
| `reviewer-core/**` | `reviewer-core/INSIGHTS.md` |
| `e2e/**` | `e2e/INSIGHTS.md` |
| `scripts/`, `.github/`, `docker-compose.yml`, vendored `shared` drift | the package whose behaviour actually breaks; if truly none, it belongs in root `CLAUDE.md` — propose it, don't append it |

There is no `packages/repo-intel` in this repo — repo-intel is a module inside
`server`, so its insights go to `server/INSIGHTS.md`.

## Sections

Pick the section by asking **one** question about the entry:

| The entry says… | Section |
|---|---|
| this approach worked, reuse it | `## What Works` |
| this approach fails, don't try it | `## What Doesn't Work` |
| this is how this codebase is shaped | `## Codebase Patterns` |
| this library/tool/CLI behaves unexpectedly | `## Tool & Library Notes` |
| this error means this, fix it like this | `## Recurring Errors & Fixes` |
| we chose X over Y, and here's why | `## Decisions` |
| what happened this session, in one line | `## Session Notes` |
| we still don't know | `## Open Questions` |

If two sections fit, pick the one matching how the next agent will *search* —
they arrive with an error message far more often than with a design question.

## Entry format

```
- **YYYY-MM-DD** — <claim, one line, imperative or declarative> — `path/file.ts:42`
```

Optional second line, indented two spaces, only when the *why* isn't obvious
from the claim. Two lines is the ceiling.

The anchor is mandatory: a `file:line`, an exact command, or a verbatim error
string. An insight with nothing to anchor it is a feeling, not an insight.

`Session Notes` entries take the date and a one-line summary; no anchor needed.

## Quality gate

Append only if the entry passes **all four**:

1. **Cold-start test** — an agent that has read this code but wasn't in this
   session does *not* already know it. If it's obvious to anyone reading the
   file, don't write it.
2. **Anchored** — has a `file:line`, a command, or a verbatim error.
3. **Actionable** — says what to do or what to avoid, not that something is
   tricky. "Be careful with async" fails. "Do X because Y" passes.
4. **Not already written down** — not in root or package `CLAUDE.md`, a README,
   a `.claude/skills/` framework skill, or already in this INSIGHTS.md.

See [examples.md](examples.md) for calibrated pass/fail pairs from this repo.

Generic programming knowledge never qualifies. Neither does anything a
typecheck, a lint rule, or a test would have caught — if the tooling can catch
it, fix the tooling instead of writing a note about it.

## How to append

Before writing, `grep` the target file for the key term (the library name, the
error fragment, the module). Then:

- **No match** → append a new entry under the right section.
- **Near-duplicate that your finding refines or contradicts** → append a new
  dated entry that names the old one; **never** edit or delete the old line.
  Contradictions are data — the reader needs to see that it changed and when.

Use the helper so the append-only invariant is mechanical, not remembered:

```bash
.claude/skills/engineering-insights/scripts/append-insight.sh server "Tool & Library Notes"
```

It reads the entry from stdin, inserts it at the end of that section, refuses an
unknown package or section, and fails if any pre-existing line would change. If
it errors, read the message — do not fall back to hand-editing the file to route
around it.

Never touch `INSIGHTS.md` with `Write`. `Edit` is for adding a missing section
heading only.

## Maintenance

- Soft cap **~40 entries per file**. Past that, signal drops. Don't prune
  silently: report which entries look stale (fixed bugs, removed code, dead
  deps) and let the human decide.
- Entries are drafts under spot-check, not verified truth. Commit them with the
  work they came from so review catches a wrong one.
- If an entry has hardened into a rule everyone must follow, say so — promoting
  it into `CLAUDE.md` is a human's call.
