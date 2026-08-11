# Agents map

Seven project subagents, checked into `.claude/agents/`. This file is a map —
for full behaviour, read the agent's own `.md`.

## At a glance

| Agent | Role | Model | Permission mode | Writes files? | Web access? |
|---|---|---|---|---|---|
| [researcher](researcher.md) | Answers "how does X work" / "what does the doc say" — repo or external | `sonnet` | `plan` | No | Yes (`WebSearch`, `WebFetch`) |
| [planner](planner.md) | Turns a request into a Development Plan | `opus` | `plan` | No | No |
| [implementer](implementer.md) | Executes an approved Development Plan | `sonnet` | `auto` | Yes | No |
| [test-writer](test-writer.md) | Writes tests for `client/`, `server/`, `reviewer-core/` and runs them | `sonnet` | `auto` | Yes — only test-file paths, enforced by a `PreToolUse` hook | No |
| [architecture-reviewer](architecture-reviewer.md) | Read-only architecture-boundary review, findings with evidence | `opus` | `plan` | No | No |
| [plan-verifier](plan-verifier.md) | Checks finished code against an approved plan, PASS/FAIL per requirement | `opus` | `default` | No | No |
| [doc-writer](doc-writer.md) | Writes feature/design docs with diagrams into the right `docs/` section | `sonnet` | `auto` | Yes — only `docs/**` paths, enforced by a `PreToolUse` hook | No |

## Pipeline

```
researcher  →  planner  →  [user approves the plan]  →  implementer  →  plan-verifier  →  [user]
   facts          plan text                                  |    ↑        PASS/FAIL/PARTIAL
                                                               |    |
                                                               v    |
                                                          test-writer
                                                               |
                                                               v
                                                     architecture-reviewer  →  [user]
                                                                                   |
                                                                                   v (explicit ask)
                                                                              doc-writer  →  docs/**
```

`test-writer` and `architecture-reviewer` both take `implementer`'s output as
input; `plan-verifier` checks `implementer`'s (and optionally `test-writer`'s)
claims against the plan itself rather than trusting either report. `doc-writer`
is not part of the automatic chain — it only runs on an explicit ask, same as
the `feature-docs` skill it wraps. Security review has no dedicated agent yet
— see "Scope boundaries" below.

Each agent starts with an **isolated context** (Claude Code subagent model):
it does not see this conversation, files already read, or another agent's
intermediate steps — only its own system prompt, the delegating task message,
the full `CLAUDE.md` hierarchy, and (for agents with a `skills:` list) their
preloaded skills. Concretely: `planner` cannot call `researcher` itself (no
`Agent` tool in its `tools:` list) and must hand `implementer` a
self-contained plan, since `implementer` will never see the conversation that
produced it. None of the seven agents has `Agent` in its `tools:` list —
every arrow in the diagram above is the calling session (or user) handing
one agent's output to the next as a task prompt, not one agent invoking
another directly.

## Scoping a research call

`researcher` shares one `maxTurns` budget between investigating and writing
its final report — a broad, multi-part question (e.g. "server routes +
client components + INSIGHTS across three packages" in one call) can burn
the whole budget on tool calls before the report gets written, so the call
returns with no report and the caller has to resume it via `SendMessage` to
get the text out. That resume roughly doubles the call's token cost for no
new information. When a research task spans more than ~2 independent areas,
split it into separate `researcher` calls scoped to one area each (e.g.
server-side facts vs. client-side facts) and dispatch them in parallel —
this also cuts wall-clock time, since neither call depends on the other.
Skip questions about packages the request has already ruled out of scope
(e.g. don't ask about `reviewer-core/INSIGHTS.md` for a change that never
touches `reviewer-core`).

## Permissions

| Agent | `tools` | `disallowedTools` | Notes |
|---|---|---|---|
| researcher | `Read, Grep, Glob, Bash, WebSearch, WebFetch, Skill` | `Write, Edit, NotebookEdit` | Read-only by tool grant, not just by convention |
| planner | `Read, Grep, Glob, Bash, Skill` | `Write, Edit, NotebookEdit, WebSearch, WebFetch` | `Bash` is for read-only exploration (`git log`, `rg`, `ls`) — `permissionMode: plan` blocks mutation attempts regardless |
| implementer | `Read, Write, Edit, Grep, Glob, Bash, Skill` | `WebSearch, WebFetch, NotebookEdit` | Writes anywhere in the four packages. `permissionMode: auto` means no per-call prompts — see the repo-wide backstop below |
| test-writer | `Read, Write, Edit, Grep, Glob, Bash, Skill` | `WebSearch, WebFetch, NotebookEdit` | Write access, but scoped to test-file paths only — via a `PreToolUse` hook in its own frontmatter (`hooks:` → `.claude/hooks/test-writer-guard.sh`), **not** via `tools`, which has no path-scoping syntax |
| architecture-reviewer | `Read, Grep, Glob, Bash, Skill` | `Write, Edit, NotebookEdit, WebSearch, WebFetch` | Read-only by tool grant, same mechanism as `researcher`/`planner` |
| plan-verifier | `Read, Grep, Glob, Bash, Skill` | `Write, Edit, NotebookEdit, WebSearch, WebFetch` | Read-only, but `permissionMode: default` (not `plan`) — it re-runs typecheck/test commands itself rather than trusting a pasted report, and `plan` mode isn't reliable for running a suite. May prompt for approval per command |
| doc-writer | `Read, Write, Edit, Grep, Glob, Bash, Skill` | `WebSearch, WebFetch, NotebookEdit` | Write access scoped to `docs/**` only — same `PreToolUse`-hook mechanism as `test-writer` (`.claude/hooks/doc-writer-guard.sh`) |

**Why a hook, not a permission rule, for `test-writer`/`doc-writer`:**
subagent frontmatter `tools`/`disallowedTools` only accept tool names, not
path globs. `settings.json` *does* support path-scoped rules
(`Edit(glob)`), but two things rule it out here: those rules apply to the
**entire session**, not to one named subagent, and a `Write(glob)` rule is
accepted but silently never enforced — only `Edit(path)` rules are
checked, and `Edit` there covers all file-editing tools including `Write`.
A `PreToolUse` hook declared in the subagent's own frontmatter is the only
mechanism that is both path-aware and scoped to a single agent. Source:
[code.claude.com/docs/en/permissions](https://code.claude.com/docs/en/permissions),
[code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents)
("Hooks in subagent frontmatter"), retrieved 2026-08-10.

**Caveat that matters operationally:** a project-level subagent's
frontmatter hooks only run once the folder containing its `.md` file has
been accepted in the workspace-trust dialog. Until then, `test-writer` and
`doc-writer` still run, but their guard script is silently skipped — the
path restriction is not enforced. Check `git status` after the first
delegation to either agent in a fresh checkout rather than assuming the
hook fired.

**Repo-wide backstop:** `.claude/settings.json` (committed) denies
`Bash(git push *)`, `Bash(gh pr create *)`, `Bash(gh pr merge *)` for every
agent and the main session — all seven agents, not only the three original
ones. Deny rules are evaluated before allow/auto and apply regardless of
`permissionMode` — this is the actual mechanism keeping `implementer` (and
`test-writer`, `doc-writer`) from pushing or opening a PR; each agent's
prompt says the same thing, but a prompt alone isn't a control.

## Preloaded skills

`skills:` injects the named skill's full `SKILL.md` at startup — not an
access restriction, just what's loaded up front. Every agent can still call
any project skill on demand via the `Skill` tool during its run.

| Agent | Preloaded | Why these |
|---|---|---|
| researcher | *(none)* | Its job is finding facts, not applying conventions |
| planner | `onion-architecture`, `frontend-architecture`, `mermaid-diagram`, `react-best-practices`, `postgresql-table-design` | Constraints and decisions a plan gets wrong once and can't cheaply undo: dependency direction, where client code lives, table shape, component split, optional architecture diagrams |
| implementer | `onion-architecture`, `frontend-architecture`, `import-hygiene`, `typescript-expert`, `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`, `zod`, `next-best-practices`, `react-best-practices`, `react-testing-library` | Full per-file craft ruleset across all four packages — applies on every touched file, not just a subset |
| test-writer | `react-testing-library`, `import-hygiene`, `onion-architecture`, `typescript-expert` | RTL for `client/` component tests; `import-hygiene` for `vi.mock()` paths; `onion-architecture` for mocking via `ContainerOverrides`/injected adapters instead of module mocks; `typescript-expert` for fixture/builder typing |
| architecture-reviewer | `onion-architecture`, `import-hygiene`, `frontend-architecture` | The three skills that define the boundaries it checks: onion layering and DI on the backend, import specifiers, `client/` placement rules |
| plan-verifier | *(none)* | Must raise exactly the skills a verified plan's own skill-routing table names, not a fixed preloaded set — a fixed set would bias attention toward what's loaded instead of what the plan required. Same argument as `researcher`'s row above |
| doc-writer | `feature-docs`, `mermaid-diagram` | `feature-docs` owns the target path and document structure; `mermaid-diagram` is the "with diagrams" requirement |

Agent prompts that carry a skill-routing table (file glob → required
skills) — `planner`, `implementer`, `test-writer`, `architecture-reviewer` —
make the specific skill to apply at a given file unambiguous, preloaded or
not. `researcher` and `plan-verifier` deliberately have none: their job is
finding facts / checking against an external list, not applying a fixed
craft ruleset. `doc-writer` doesn't need one — its two preloaded skills
cover its entire scope.

## Input / output artifacts

| Agent | Input (task prompt) | Output |
|---|---|---|
| researcher | A question | Structured report: findings + verbatim evidence + exact `file:line` refs + explicit "could not establish" list |
| planner | A feature/change request | `# Development Plan` (Ukrainian) — scope, INSIGHTS.md-informed context, ordered steps with per-step skills and a falsifiable done-condition, skill-routing table, verification commands, risks/open questions |
| implementer | A `# Development Plan` (full text, pasted into the delegating prompt) | `# Implementation Report` (Ukrainian) — per-step status, skills applied, **actual** typecheck/test output, deviations from plan, handoff notes for review/insights |
| test-writer | The code to test (path or diff) | `# Test Report` (Ukrainian) — tests added/changed with what they cover, skills applied, **actual** test/typecheck output, what's left uncovered and why |
| architecture-reviewer | A diff, branch, or file/directory to check | `# Architecture Review` (Ukrainian) — CRITICAL/WARNING/SUGGESTION findings each with `path:line` + excerpt + fix, a verdict |
| plan-verifier | A plan/requirements list + what counts as "the change" | `# Plan Verification` (Ukrainian) — PASS/FAIL/PARTIAL/NOT VERIFIABLE per requirement with evidence, re-run command output, a verdict |
| doc-writer | A feature, plan, or implementation report to document | `# Doc Report` (Ukrainian) — which `docs/` file was written/updated and why, diagrams added, gaps |

Plan and report body text is Ukrainian per the root `CLAUDE.md` language
convention; the agent definitions themselves (system prompts, this file) are
English.

## Scope boundaries (who does *not* do what)

- Neither `planner` nor `implementer` performs architecture or security
  review — architecture review now has an owner (`architecture-reviewer`);
  **security review still does not** — there is a `security` skill but no
  dedicated agent. Don't read `architecture-reviewer` as covering that gap.
- `implementer` does not run `pr-self-review`, `feature-docs`, or
  `engineering-insights`, and does not commit unless the plan explicitly asks.
- `implementer` never verifies UI changes by driving a browser — `client/CLAUDE.md`
  forbids it; `pnpm test` / `pnpm typecheck` are the verification.
- `planner` never writes code; a plan missing its skill-routing table is
  defined as invalid and must not be returned.
- `test-writer` never edits production code to make a test pass, and never
  touches `e2e/specs/*.flow.json`.
- `architecture-reviewer` never fixes what it finds, never does security,
  correctness, or performance review, and never checks code against a plan
  (that's `plan-verifier`).
- `plan-verifier` never gives general advice or flags anything the plan
  didn't ask for; a requirement outside the plan is logged, not judged. It
  never fixes anything and never writes files.
- `doc-writer` never edits code, `CLAUDE.md`, or any `INSIGHTS.md`, never
  runs proactively, and is not `engineering-insights` (different file,
  different trigger).

## Sources the agent rules are built on

| Rule | Source | Applied in |
|---|---|---|
| Only `name`/`description` required; `tools` omitted = inherit all; `model` omitted = `inherit` | Claude Code docs, *Subagents* — "Supported frontmatter fields" | Both agents set `tools`/`model` explicitly rather than relying on defaults |
| `disallowedTools` resolves before `tools` | Claude Code docs, *Subagents* | `implementer.md` frontmatter: `Skill` allowed, `WebSearch`/`WebFetch` denied |
| `skills:` preloads content, does **not** restrict access; the `Skill` tool still reaches every project skill | Claude Code docs, *Subagents* — "skills" field | Both agents keep `Skill` in `tools` alongside a `skills:` preload list |
| Subagent context is isolated — no conversation history, no sibling context | Claude Code docs, *Subagents* — "Context isolation" | `implementer.md` "Context you must assume" section; drives the requirement that `planner`'s output be fully self-contained |
| "Design focused subagents: each should excel at one specific task" | Claude Code docs, *Subagents* — best practices | Split into `planner` (plan only, no `Write`/`Edit`) vs `implementer` (execute only, no review) instead of one agent |
| "Write detailed descriptions... include what it's NOT" pattern | Claude Code docs, *Subagents* — best practices | Both `description` fields state explicitly what the agent is not (vs `researcher`, vs each other) |
| "Limit tool access: grant only necessary permissions" | Claude Code docs, *Subagents* — best practices | Neither `planner` nor `implementer` has `WebSearch`/`WebFetch`; unresolved external facts are pushed to `researcher` instead |
| `deny` rules evaluate before `allow`/`auto` and still apply under `permissionMode: auto` | Claude Code docs, *Permissions* — precedence and mode table | `.claude/settings.json` `permissions.deny` on `git push` / `gh pr create` / `gh pr merge` — the actual backstop for `implementer.md`'s "does not push" claim |
| `Bash(cmd *)` word-boundary matching | Claude Code docs, *Permissions* — Bash rule syntax | Deny-rule syntax in `.claude/settings.json` |
| Package manager split (pnpm: server/client · npm: reviewer-core/e2e), no workspace | root `CLAUDE.md` | Both agents' "package managers" constraint, verbatim |
| Import direction `client ↛ server` · `server ↛ client` · `reviewer-core ↛ both` | root `CLAUDE.md` | Both agents' hard-constraints section |
| Session protocol: read `INSIGHTS.md` before non-obvious work | root `CLAUDE.md` — "Session protocol" | `planner.md` step 3 of "When invoked" (implementer doesn't repeat this — it receives the plan's findings already, per context isolation) |
| `reviewer-core` purity: no DB/HTTP/fs/env | `reviewer-core/CLAUDE.md` | Both agents' constraints list |
| Fastify module layout, schema-first routes, DI container | `server/CLAUDE.md` | `implementer.md` architectural-rules section |
| Never verify UI via browser tool | `client/CLAUDE.md` — "Verification" | `implementer.md` verification section |
| Migrations generated, never hand-edited | root `CLAUDE.md` — "Do not touch" | Both agents' constraints list |
| `tools`/`disallowedTools` accept only tool names (+ `mcp__<server>[__*]`, `Agent(agent_type)`) — no file-path/glob scoping | [code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents), "Available tools" (retrieved 2026-08-10) | Ruled out `tools:`-based path scoping for `test-writer`/`doc-writer` |
| `Edit(glob)` permission rules cover all file-editing tools including `Write`; a `Write(glob)` rule is accepted but never enforced | [code.claude.com/docs/en/permissions](https://code.claude.com/docs/en/permissions) (retrieved 2026-08-10) | Ruled out `settings.json permissions.deny`/`allow` with `Write(...)` for scoping `doc-writer`/`test-writer` |
| `settings.json` `permissions.allow`/`deny` rules apply to the entire session, not to one named subagent | [code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents) — "these rules apply to the entire session, not only the plugin subagent" (retrieved 2026-08-10) | Ruled out session-wide permission rules as a per-agent path scope; drove the choice of a frontmatter `PreToolUse` hook instead |
| `PreToolUse` hooks declared in a subagent's own frontmatter (`hooks:` field) run only while that subagent is active, receive `tool_input.file_path` as JSON on stdin, and block via exit code 2 | [code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents) — "Hooks in subagent frontmatter" / "Conditional rules with hooks" (`db-reader` example); [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks) — `PreToolUse` input schema and exit-code contract (retrieved 2026-08-10) | `test-writer.md` and `doc-writer.md` `hooks: PreToolUse` blocks + `.claude/hooks/{test-writer,doc-writer}-guard.sh` |
| Project-level subagent frontmatter hooks require the workspace-trust dialog to be accepted for the folder containing the agent file; until then the hook is silently skipped | [code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents) — "Hooks in subagent frontmatter" (retrieved 2026-08-10) | "Caveat that matters operationally" note in the Permissions section above; repeated as a comment in both guard scripts |
| `$CLAUDE_PROJECT_DIR` is exported as a real environment variable inside a hook script's process, not just a command-string substitution | [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks) (retrieved 2026-08-10) | Both guard scripts read `$CLAUDE_PROJECT_DIR` to normalize `tool_input.file_path` before matching it against allowed globs |
| No dedicated "read-only" `permissionMode`; built-in read-only subagents (Explore, Plan) are read-only via `tools` exclusion of `Write`/`Edit`, not `permissionMode` alone | [code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents) — "Permission modes", "Built-in subagents" (retrieved 2026-08-10) | `architecture-reviewer.md` and `plan-verifier.md` are read-only via `tools`/`disallowedTools`, matching `researcher`/`planner`, not via a `permissionMode` alone |
| Official example subagent `code-reviewer`: `tools: Read, Grep, Glob, Bash`, checklist output prioritized as Critical/Warnings/Suggestions | [code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents), "Example subagents" (retrieved 2026-08-10) | `architecture-reviewer.md`'s tool list and CRITICAL/WARNING/SUGGESTION severity contract (aligned with `.claude/skills/pr-self-review/SKILL.md`'s existing contract) |
| `"use proactively"` in `description` is an officially recommended phrase to encourage automatic delegation | [code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents), best practices + "Understand automatic delegation" (retrieved 2026-08-10) | `test-writer.md`, `architecture-reviewer.md`, `plan-verifier.md` descriptions use "Use proactively"; `doc-writer.md` deliberately does not (it must not trigger automatically — see its description) |

No official Claude Code doc defines a "planner vs implementer" role split, a
"verify code against a plan" agent role, or a pass/fail-per-requirement
report format — external research against the sources above (2026-08-10)
came back "не знайдено" for all three. That composition, `plan-verifier`'s
entire format, and the skill-routing tables are this repository's own
design, built from the general best practices above. Likewise, the `MUST
BE USED`-style phrasing and the convention of stating what an agent is
**not** in its `description` (used throughout this file) are this
repository's own convention, not a documented Claude Code recommendation —
do not cite them as one.
