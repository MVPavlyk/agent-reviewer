# Routing — file → skill

Two passes: (1) remove excluded paths, (2) match everything left against the
table below. A changed path can match more than one row.

## Matching rule — READ THIS FIRST

Match on the literal path segments `git` gives you (substring / segment
comparison), **never** shell-style globbing. This repo's client routes use
bracketed dynamic segments — `[repoId]`, `[number]`, `[id]`, `[section]` — and a
glob matcher reads a literal `[` as the start of a character class. Implemented
naively, the entire `client/src/app/**` tree silently stops routing and every
UI change falls through to the no-skill bucket. If your routing check is
built on `minimatch`/`picomatch` glob syntax, escape `[` and `]` before
matching, or match on split path segments instead.

## 1. Exclusions (evaluated first, removed from the review set entirely)

| Path | Why | Still checked by |
|---|---|---|
| `server/src/db/migrations/**` (`*.sql`, `meta/*.json`, `_journal.json`) | drizzle-generated; root CLAUDE.md forbids hand-editing or hand-numbering | migration-integrity invariant only ([repo-invariants.md](repo-invariants.md)) — **never** `drizzle-orm-patterns` |
| `client/src/vendor/ui/**` | vendored UI kit, not product code | nothing |
| `client/src/vendor/shared/**` | trimmed mirror of the server contracts | vendor-drift invariant |
| `server/src/vendor/shared/**` | hand-vendored `@devdigest/shared`, source of truth | `zod` + vendor-drift invariant (it *is* the contract) |
| `server/clones/**` | do-not-touch, git-ignored checkouts | nothing — its presence in the diff is itself CRITICAL (see [severity.md](severity.md)) |
| `agent-runner/dist/**` | committed build output (deliberately un-ignored) | nothing |
| lockfiles (`pnpm-lock.yaml`, `package-lock.json`) | not reviewable content | package-manager invariant — a lockfile in the *wrong* package is CRITICAL |
| `client/messages/**/*.json` | i18n string data | locale-key-parity invariant only |
| `node_modules/`, `.next/`, `coverage/`, `dist/`, `build/`, `out/`, `.turbo/` | gitignored, never real diff content | nothing |
| binary files (images, fonts, `.woff*`, `.ico`, anything `git diff --numstat` reports as `-`/`-`) | not reviewable as text | nothing |

## 2. Rename / delete handling

`git diff --name-status` reports `R###` (rename) and `D` (delete) statuses that
the table below doesn't cover directly:

- **Renamed** (`R`) — route the file at its **new** path, normally. Content is
  usually unchanged; skills still apply if the destination path matches.
- **Deleted** (`D`) — never sent to a domain skill (there's no content to
  review). Instead check the deletion against the "orphan" invariant in
  [repo-invariants.md](repo-invariants.md): a deleted `service.ts`/`route.ts`
  must not leave a dangling reference in `modules/index.ts` or in a caller.

## 3. File → skills

| Changed path | Skills |
|---|---|
| `client/src/app/**/{page,layout,loading,error,not-found,template}.tsx`, `.../route.ts` | `next-best-practices`, `frontend-architecture` |
| `client/src/app/**/_components/**/*.tsx`, `client/src/components/**/*.tsx` | `react-best-practices`, `frontend-architecture` |
| `client/src/lib/hooks/**`, `client/src/lib/api.ts` | `react-best-practices`, `frontend-architecture` (+ `zod` if the file declares/parses a schema) |
| other `client/src/lib/**`, any `index.ts` barrel under `client/src` | `frontend-architecture` |
| `client/**/*.test.tsx`, `client/**/*.test.ts` | `react-testing-library` |
| any `.ts(x)` heavy on generics / conditional / mapped types / `as` casts | `typescript-expert` — content trigger only, never routed blanket by path |
| `server/src/modules/*/routes.ts` | `fastify-best-practices`, `onion-architecture`, `zod`, `security` |
| `server/src/modules/*/service.ts` | `onion-architecture` (+ `security` if it touches auth, secrets, or user input) |
| `server/src/modules/*/repository.ts`, `server/src/modules/*/repository/*.repo.ts` | `drizzle-orm-patterns`, `onion-architecture` |
| `server/src/db/schema/*.ts`, `server/src/db/schema.ts` | `drizzle-orm-patterns`, `postgresql-table-design` |
| `server/src/platform/*.ts` | `onion-architecture` (+ `security` for `config.ts` / secrets-adjacent files) |
| `server/src/adapters/**/*.ts` | `onion-architecture` (+ `fastify-best-practices` only if it exposes a Fastify surface) |
| `server/src/vendor/shared/**/*.ts` | `zod`, `typescript-expert` |
| `reviewer-core/src/**/*.ts` | `onion-architecture`, `typescript-expert` (+ `zod` on contract files) |
| `server/test/**`, `e2e/**`, `**/*.md`, `docs/**`, `.claude/**`, `*/CLAUDE.md`, `*/INSIGHTS.md` | none by path — repo-invariants + general bucket only (`mermaid-diagram` only on a content trigger, see below) |

**Never routed, by name, regardless of path:** `engineering-insights`,
`feature-docs` — these are process skills, not review knowledge. Keep this as
an explicit deny-list so a future skill dropped into `.claude/skills/` doesn't
get silently pulled into review.

**`mermaid-diagram`** routes only on a content trigger — the diff adds or edits
a ` ```mermaid ` fence — never on a path.

## 4. No-skill case

A changed file matching nothing above is **not skipped**. Put it in a
`general` bucket and review it against `docs/agent-prompts/general-reviewer.md`'s
"what to look for" list plus [repo-invariants.md](repo-invariants.md). List
these files in the report under "Reviewed without a domain skill" so the gap
stays visible instead of silently disappearing.

## 5. Cap and priority

**Hard cap: 8 skills across at most 4 groups** (see the fan-out groups in
`SKILL.md`). Beyond that, per-skill review quality degrades faster than
coverage improves. When routing yields more than 8 skills, drop by this
priority — higher survives:

1. Skills whose file-count share of the diff is largest.
2. `security` — never dropped if `routes.ts`, `platform/config.ts`, auth code,
   or any secrets-adjacent file is in the diff. It's the only skill that can
   surface a CRITICAL nothing else can.
3. `onion-architecture` / `frontend-architecture` — architecture drift is what
   this self-review is uniquely positioned to catch; CI never does.
4. Framework mechanics: `fastify-best-practices`, `next-best-practices`,
   `drizzle-orm-patterns`, `react-best-practices`.
5. `zod`, `postgresql-table-design`.
6. `typescript-expert`, `react-testing-library`, `mermaid-diagram` — dropped first.

Dropped skills are **named in the report** ("Not run under the 8-skill cap: …")
so the cap is honest, not silent. `repo-invariants.md` checks are never subject
to the cap — they always run.

## 6. Diff-size ceiling

If the deduplicated file set from Phase 0 exceeds **50 files**, skip routing
and fan-out entirely for this run. Run only the repo-invariants checks (they're
cheap and mechanical) and produce a short summary. State plainly in the report
that the diff is too large for a per-skill review and recommend splitting the
PR. A diff this size (typically post-rebase or post-merge) would blow the
context budget of the fan-out subagents and produce a worse review, not a
better one, if forced through the normal path.
