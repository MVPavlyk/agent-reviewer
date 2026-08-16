---
name: agents-curator
description: Keeps .claude/agents/README.md (the agent map for researcher/planner/implementer) in sync with reality. Use once a skill under .claude/skills/*/SKILL.md is finished — created for the first time, or an existing one's frontmatter (name/description) or scope changed on purpose — not on every intermediate edit while skill-creator is still drafting or running evals. Also triggered by "update agents README", "sync the agent roster", "/agents-curator". Re-reads .claude/agents/*.md frontmatter and .claude/skills/*/SKILL.md frontmatter and corrects any table in README.md that has drifted; flags judgment calls (e.g. "should this new skill be preloaded by implementer?") instead of deciding them. Does not edit agent files, does not duplicate agent prompt bodies or skill-routing tables into README. Does not write INSIGHTS.md entries (see engineering-insights) or docs/features/*.md (see feature-docs) — this skill only touches .claude/agents/README.md.
---

# Agents Curator

`.claude/agents/README.md` is a hand-authored map, not a copy of the agent
prompts. This skill keeps its *factual* tables — the ones that just restate
frontmatter — accurate as `.claude/skills/` and `.claude/agents/` evolve. It
never makes the judgment calls README's design depends on; those stay with a
human or with whoever is building the plan/agent in the first place.

## When to run

1. **A skill is created or edited — and finished.** Any `.claude/skills/*/SKILL.md`
   is written for the first time, or an existing one's `name`, `description`,
   or overall scope changes on purpose. Skip pure typo/wording fixes that
   don't change what the skill does or who should use it.
2. **Explicit ask.** "update agents README", "sync the agent roster",
   "/agents-curator".

Do **not** run this for edits to `.claude/agents/*.md` themselves — those
files are the source of truth this skill reads *from*, not a trigger to write
to them.

Do **not** run this on every intermediate save while `skill-creator` is still
drafting, testing, or running eval iterations on a skill — those SKILL.md
edits aren't finished yet and syncing against a moving target just produces
noise. Run once, after the skill is done (the same point the root `CLAUDE.md`
QA-gate step already runs).

## What "in sync" means — the four factual checks

Read every `.claude/agents/*.md` frontmatter and every
`.claude/skills/*/SKILL.md` frontmatter, then check `.claude/agents/README.md`
against them:

1. **"At a glance" table** — `model` and `permissionMode` columns match each
   agent's current frontmatter.
2. **"Permissions" table** — `tools` / `disallowedTools` columns match.
3. **"Preloaded skills" table** — the skill list per agent matches that
   agent's `skills:` frontmatter exactly: add a row for a newly preloaded
   skill, remove one for a dropped skill, fix a typo'd skill name.
4. **"Why these" rationale + the "Sources" table's one-line rules** — if the
   skill that triggered this run is referenced in either, re-read its current
   `description` and check the README prose still describes what the skill
   actually does now. If the skill's scope changed enough that the sentence
   is stale, rewrite that sentence. If it still holds, leave it.

Apply corrections directly with Edit. Leave everything else in README
untouched — this is a sync pass, not a rewrite.

## What is a judgment call, not a sync — report, don't apply

- A new skill looks relevant to `planner` or `implementer` but isn't in their
  `skills:` list yet. This changes the agent's preload token budget and is a
  deliberate choice (see README's own "why these" column) — do not add it to
  the agent's frontmatter yourself. Say so as a suggestion.
- A skill was removed or renamed and an agent's `skills:` list now points at a
  dead name. Report the break; do not silently delete the agent's reference
  or guess a replacement.
- A brand-new agent file appears with no corresponding README row. Report it;
  don't draft its README section from a guess at its purpose.

## Hard rules

- Never touch an agent's `skills:`, `tools`, `model`, or any other frontmatter
  — this skill only edits `README.md`.
- Never duplicate an agent's system-prompt body, or the skill-routing tables
  that live inside `planner.md` / `implementer.md`, into README — README
  stays a map by design; that boundary is not this skill's to relax.
- If `.claude/agents/README.md` doesn't exist yet, stop and say so. Don't
  create one from scratch — its structure was hand-designed and this skill
  has no basis for inventing it.

## Output

A short report: which README rows were corrected (with a one-line reason
each), and any judgment-call suggestions flagged but not applied. "No drift
found" is a valid and expected outcome most of the time.
