# agent-reviewer (DevDigest)

Local-first AI PR review. Four standalone packages — **no monorepo tooling**
(no turbo/nx/pnpm workspace). Cross-package types resolve through tsconfig
`paths`, not published packages.

## Map
| Path | Package | Owns |
|---|---|---|
| `server/` | `@devdigest/api` | Fastify API, Postgres/Drizzle, adapters, repo-intel |
| `client/` | `@devdigest/web` | Next.js 15 studio UI |
| `reviewer-core/` | `@devdigest/reviewer-core` | pure engine: diff → prompt → LLM → findings |
| `e2e/` | `@devdigest/e2e` | deterministic browser flows |

Each package has its own `CLAUDE.md`, loaded when you touch files there.
Package-specific rules live there; this file holds only what spans packages.

## Package managers — DO NOT MIX
| Package | Manager | Lockfile |
|---|---|---|
| `server/`, `client/` | **pnpm** | `pnpm-lock.yaml` |
| `reviewer-core/`, `e2e/` | **npm** | `package-lock.json` |

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
Per-package commands: see that package's CLAUDE.md.

## Do not touch
- `server/clones/**` — git-ignored checkouts of imported repos, not source.
- `server/src/db/migrations/*` and `meta/` — drizzle-generated. Never hand-edit
  or hand-number; add migrations via `pnpm db:generate`.
