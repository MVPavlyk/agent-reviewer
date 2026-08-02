# Worked example — `feat/l-02`

This is the diff this skill was designed against, taken from a real branch
state. Not a fixture built for the docs — the actual `git status` output at
the time this skill was written.

## Phase 0 — collected diff (21 files)

Modified (14):
```
.claude/skills/README.md
CLAUDE.md
client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx
client/src/app/agents/[id]/_components/AgentEditor/_components/ConfigTab/ConfigTab.tsx
client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx
client/src/lib/hooks/index.ts
server/src/db/migrations/meta/_journal.json
server/src/db/schema/pulls.ts
server/src/db/schema/reviews.ts
server/src/db/schema/runs.ts
server/src/modules/polling/routes.ts
server/src/modules/pulls/routes.ts
server/src/modules/repos/repository.ts
server/src/modules/reviews/repository/run.repo.ts
```

Untracked (7, two of them directories expanded to their files):
```
.claude/skills/frontend-architecture/**
.claude/skills/onion-architecture/**
server/src/db/migrations/0012_green_argent.sql
server/src/db/migrations/meta/0012_snapshot.json
server/src/modules/polling/service.ts
server/src/modules/pulls/repository.ts
server/src/modules/pulls/service.ts
```

## Phase 1 — routing

| File(s) | Skills | Why |
|---|---|---|
| `AgentEditor.tsx`, `ConfigTab.tsx`, `RunHistory.tsx` | `react-best-practices`, `frontend-architecture` | under `_components/**` — note these sit inside `[id]`, `[repoId]`, `[number]` bracketed segments; matched on path segments, not shell-glob, or these three would silently fall through |
| `client/src/lib/hooks/index.ts` | `frontend-architecture`, `react-best-practices` | hooks barrel |
| `server/src/db/schema/{pulls,reviews,runs}.ts` | `drizzle-orm-patterns`, `postgresql-table-design` | drizzle schema |
| `server/src/modules/{polling,pulls}/routes.ts` | `fastify-best-practices`, `onion-architecture`, `zod`, `security` | route files |
| `server/src/modules/{polling,pulls}/service.ts` (new) | `onion-architecture` | service layer |
| `server/src/modules/pulls/repository.ts` (new), `server/src/modules/repos/repository.ts`, `server/src/modules/reviews/repository/run.repo.ts` | `drizzle-orm-patterns`, `onion-architecture` | repository layer |
| `CLAUDE.md`, `.claude/skills/README.md`, `.claude/skills/{frontend-architecture,onion-architecture}/**` | *(none — general bucket + repo-invariants)* | docs / skill definitions themselves |
| `server/src/db/migrations/0012_green_argent.sql`, `meta/0012_snapshot.json`, `meta/_journal.json` | *(excluded — migration-integrity invariant only)* | drizzle-generated |

Union: **exactly 8 skills** — `fastify-best-practices`, `onion-architecture`,
`zod`, `security`, `drizzle-orm-patterns`, `postgresql-table-design`,
`react-best-practices`, `frontend-architecture`. Right at the cap, nothing
dropped.

Notably **not** routed, and why that's correct:
- `next-best-practices` — no `page.tsx`/`layout.tsx`/`route.ts` changed; the
  three `.tsx` files are all under `_components/`, not route files.
- `react-testing-library` — no `*.test.tsx` touched. This instead produces a
  WARNING from repo-invariants: three components changed, no colocated test
  updated.
- `typescript-expert`, `mermaid-diagram`, `engineering-insights`,
  `feature-docs` — no trigger for any of them in this diff.

21 files across 4 groups → the fast path does **not** apply (>5 files, >2
groups); this runs as a 4-way fan-out (`backend-api`, `backend-data`,
`frontend`, `crosscut`).

## Phase 3 — sample report excerpt

```markdown
## PR Self Review — Changes requested

_Tree: 9c1e4a7f_

**3 findings** · 1 critical · 1 warning · 1 suggestion

**Verdict:** `request_changes` — merge blocked until the CRITICAL is fixed or waived.

### Scope
- Branch `feat/l-02` vs `main` · 21 files (14 modified, 7 untracked)
- Excluded from review: `server/src/db/migrations/**` (generated, 3 files) —
  migration-integrity invariant passed: new `.sql` + matching snapshot +
  `_journal.json` that only gained an entry is a consistent generated set
- Routed skills: fastify-best-practices, onion-architecture, zod, security,
  drizzle-orm-patterns, postgresql-table-design, react-best-practices,
  frontend-architecture
- Reviewed without a domain skill: CLAUDE.md, .claude/skills/README.md,
  .claude/skills/frontend-architecture/**, .claude/skills/onion-architecture/**

### Findings
- 🔴 **Adapter constructed directly in service instead of via DI** (critical, bug)
  — `server/src/modules/pulls/service.ts:18`
  - `PullsService` calls `new GithubClient(...)` directly instead of
    receiving it through `platform/container.ts`. Breaks the DI convention
    server/CLAUDE.md requires and makes this service untestable without a
    live GitHub client — matches always-CRITICAL invariant #6.
  - _Suggestion:_ Accept `GithubClient` (or its interface) as a constructor
    parameter, bind the concrete adapter in `container.ts`.
- 🟡 **New service has no colocated repository-layer test** (warning, test)
  — `server/src/modules/pulls/service.ts`
  - Repo-invariants: a new `service.ts` was added with no corresponding test
    file in the diff.
- 🔵 **`RunHistory.tsx` prop drilling could use context** (suggestion, style)
  — `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx:34`
  - Minor readability nit from react-best-practices; not required to merge.

### Blockers
1. `server/src/modules/pulls/service.ts:18` — adapter constructed inline instead of via DI container

_Generated by /pr-self-review. Not a substitute for the DevDigest PR review._
```

(Findings above are illustrative of the *shape* and *severity calibration*
expected — actual findings depend on reading the real diff content, which
this example doesn't reproduce line-by-line.)

## What this example is asserting

- The union-of-diff-sources collection expands untracked directories instead
  of treating them as one opaque entry.
- The bracketed dynamic-segment paths (`[id]`, `[repoId]`, `[number]`) route
  correctly — this is the single highest-value check for a routing
  implementation, see [rules/routing.md](rules/routing.md).
- Generated migration files are excluded from domain-skill review but still
  pass through the migration-integrity invariant.
- The 8-skill cap is hit exactly, with nothing to drop.
- Docs and skill-definition files with no domain skill still get reviewed via
  the general bucket + repo-invariants, not silently skipped.
