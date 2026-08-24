# agent-reviewer (DevDigest)

Local-first AI PR review. Four standalone packages — **no monorepo tooling**
(no turbo/nx/pnpm workspace). Cross-package types resolve through tsconfig
`paths`, not published packages.

## Language
Plan mode output (the plan text shown via `ExitPlanMode`) is written in
Ukrainian by default. Everything else (code, comments, commit messages,
chat replies) follows the language the user is writing in, unless asked
otherwise.

## Map
| Path | Package | Owns |
|---|---|---|
| `server/` | `@devdigest/api` | Fastify API, Postgres/Drizzle, adapters, repo-intel |
| `client/` | `@devdigest/web` | Next.js 15 studio UI |
| `reviewer-core/` | `@devdigest/reviewer-core` | pure engine: diff → prompt → LLM → findings |
| `e2e/` | `@devdigest/e2e` | deterministic browser flows |
| `mcp/` | `@devdigest/mcp` | MCP server: 5 tools over the DevDigest REST API |

Each package has its own `CLAUDE.md`, loaded when you touch files there.
Package-specific rules live there; this file holds only what spans packages.

## Package managers — DO NOT MIX
| Package | Manager | Lockfile |
|---|---|---|
| `server/`, `client/` | **pnpm** | `pnpm-lock.yaml` |
| `reviewer-core/`, `e2e/`, `mcp/` | **npm** | `package-lock.json` |

No `packageManager` field enforces this — CI does (`reviewer-core.yml` runs
`npm ci`; server/client workflows run `pnpm install --frozen-lockfile`).
`pnpm install` inside `reviewer-core/` or `e2e/` creates a stray lockfile and
breaks CI. The root README's "pnpm ≥ 10" covers server/client only.

`server/pnpm-workspace.yaml` and `client/pnpm-workspace.yaml` are **not**
workspace definitions — they hold pnpm 10 `allowBuilds:` approvals only.
There is no workspace: never use `pnpm -r` or `workspace:*`.

## Shared contracts
`@devdigest/shared` is hand-vendored (no sync script) into two places:
- `server/src/vendor/shared` — **source of truth**
- `client/src/vendor/shared` — deliberately trimmed, UI-only subset

They differ on purpose (server's `ProviderId` adds `'openrouter'`; `CommitFile*`
is server-only). Add a contract to server first, then mirror into client **only**
what the UI needs. `reviewer-core` keeps no copy — its tsconfig points at server's.

## Import direction
`client ↛ server` · `server ↛ client` · `reviewer-core ↛ both`
(reviewer-core may use shared types via its alias, nothing else).

## Framework conventions
Live in `.claude/skills/` (drizzle, fastify, zod, react, postgresql, typescript,
next, security, frontend-architecture, onion-architecture). Never restate them in a CLAUDE.md.

### Creating or editing a skill
Write the domain content by hand (research, decisions) — the `skill-creator`
skill doesn't substitute for that. Once a skill has a draft, run
`skill-creator` (`anthropic-skills:skill-creator`) as a **QA gate before
calling it done**: it validates `SKILL.md` structure/frontmatter and checks
the `description` for triggering accuracy against sibling skills already in
`.claude/skills/` (overlap/ambiguity, missing keywords). Do this for new
skills and for edits that change scope or add a section, not just at
creation time.

A skill isn't done without matching evals under `evals/skills/<name>/`
(`<name>.eval.ts`, `<name>.cases.ts`, `fixtures/`) — scaffold with
`pnpm eval:scaffold <name>` from `evals/` (or, if that hits the pnpm
build-approval prompt, run `./node_modules/.bin/tsx src/scaffold.ts <name>`
directly) and write real `quality`-kind cases, not the TODO template. See
`evals/README.md` and `evals/skills/dependency-checker/` for the pattern —
match the cases' expectations to the skill's own vocabulary (e.g. this
repo's CRITICAL/WARNING/SUGGESTION severity tiers), not a generic
placeholder scheme.

## Eval routing — what to run after touching what
`evals/` (see its own `README.md` for the full three-tier design) is the
source of truth for whether a skill, an agent, or a routing rule actually
behaves as documented — not just that it reads well. Match the change to the
**minimum** check below before calling the change done; a deeper eval never
hurts, but skipping the minimum for the row that applies is how a stale
case/routing rule survives unnoticed (see `evals/skills/dependency-checker/`
and `evals/agents/architecture-reviewer-lite/` for two examples already
caught this way).

| Change | Minimum check |
|---|---|
| `.claude/skills/**` | `pnpm eval:quality <name>` (static gate, no model) **and** that skill's `evals/skills/<name>/<name>.eval.ts` |
| `.claude/agents/**` | that agent's `evals/agents/<name>/<name>.eval.ts` **and**, if the change could affect *when* the agent gets invoked (description, dispatch conditions), the relevant case in `evals/workflow/*.eval.ts` |
| `CLAUDE.md` / a package's `CLAUDE.md` / any "Read when" routing table | `pnpm eval:workflow` — routing is a systemic (workflow-tier) behavior, not something a content-only skill/agent eval can see |
| An eval case (`*.cases.ts`) or the grader/scoring logic (`evals/src/scoring/*`) | re-run and re-save the baseline it will be compared against (`pnpm eval:repeat <pattern> -n N --label baseline`) — an old baseline compared against a changed grader is not a valid delta |

Run commands from `evals/`, using the Node/pnpm path in "No system Node in
the agent shell" below.

## Session protocol — INSIGHTS.md
Every package has an append-only `INSIGHTS.md` next to its `CLAUDE.md`.

- **Before non-obvious work** in a package, read its `INSIGHTS.md` and say which
  entries bear on the task. Treat them as high-confidence unless the code
  contradicts them — they were written by someone who hit the wall.
- **During and at the end** of any session that had a problem, a decision, or a
  discovery, use the `engineering-insights` skill to append what was learned.
  Do not skip it because the session "went fine" — the fix that took three
  attempts is exactly the entry worth having.

`CLAUDE.md` is the handbook: stable, curated, human-owned. `INSIGHTS.md` is the
running notes: append-only, dated, never rewritten. Don't move entries between
them on your own.

## `docs/` means three different things
- `docs/agent-prompts/` (root) — **product** content: human-readable copies of
  agents' `system_prompt`. The DB is the runtime source of truth.
- `docs/features/` (root) — one file per shipped cross-package feature (what
  it does, why, how the pieces fit) — written on request via the
  `feature-docs` skill, e.g. `docs/features/run-cost-badge.md`.
- `<package>/docs/` — developer design notes / ADRs for that package.

## Commands
`./scripts/dev.sh` — Postgres + migrate + seed + API + web, from zero.
`pnpm verify:l06` (run from `server/`) — one-command gate for the eval-pipeline
feature: typecheck + tests across `server`/`client`/`reviewer-core` plus the
static import check on `reviewer-core/src/eval/**` (`scripts/verify-l06.sh`).
Per-package commands: see that package's CLAUDE.md.

### No system Node in the agent shell
This machine has no `node`/`npm`/`pnpm` on `PATH` outside the IDE. WebStorm
bundles its own, under a version-numbered folder that changes with IDE
updates — locate it instead of hardcoding the version:

```bash
NODE_BIN="$(dirname "$(find "$HOME/Library/Application Support/JetBrains"/WebStorm*/node/versions/*/bin/node 2>/dev/null | head -1)")"
export PATH="$NODE_BIN:$PATH"
```

That bin dir also has `pnpm`, `npm`, and `npx` — no separate pnpm install
needed. Confirmed working: `pnpm run typecheck` in `client/` via this path.

## Do not touch
- `server/clones/**` — git-ignored checkouts of imported repos, not source.
- `server/src/db/migrations/*` and `meta/` — drizzle-generated. Never hand-edit
  or hand-number; add migrations via `pnpm db:generate`.
