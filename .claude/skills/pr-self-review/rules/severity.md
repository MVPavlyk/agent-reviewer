# Severity — the finding contract

Target vocabulary is this repo's own product contract:
[`server/src/vendor/shared/contracts/findings.ts`](../../../../server/src/vendor/shared/contracts/findings.ts) —
`Severity = z.enum(['CRITICAL', 'WARNING', 'SUGGESTION'])`,
`FindingCategory = z.enum(['bug','security','perf','style','test'])`,
`Verdict = z.enum(['request_changes','approve','comment'])`.

**Governing rule, apply it to every finding before it goes in the report:**

> A source skill's severity is evidence, not a verdict. Re-derive the level
> from the product rubric in
> [`docs/agent-prompts/general-reviewer.md`](../../../../docs/agent-prompts/general-reviewer.md)
> (lines ~52-73): CRITICAL means a security breach, data loss/corruption,
> incorrect results, a crash, or a broken contract callers depend on — and is
> the ONLY level that blocks merge. WARNING is a real problem that doesn't
> block. SUGGESTION is a nit. Do not report a finding you'd dismiss as a likely
> false positive.

## Normalization table

| Source skill / scale | Source level | → Target | Note |
|---|---|---|---|
| `security` (CRITICAL/HIGH/MEDIUM/LOW) | CRITICAL | CRITICAL | |
| | HIGH | CRITICAL **iff** the exploit path is reachable from unauthenticated or user-controlled input present in *this* diff; otherwise WARNING | HIGH means "exploitable with conditions" — the condition must be shown, not assumed |
| | MEDIUM | WARNING | |
| | LOW | dropped | the skill's own rule: don't report LOW |
| `react-best-practices`, `frontend-architecture` (CRITICAL/HIGH/MEDIUM) | CRITICAL | **WARNING** by default; CRITICAL only if it produces a wrong render, a crash, or data loss on a real path | see asymmetry note below |
| | HIGH | WARNING | perf/scaling risk → WARNING under the product rubric |
| | MEDIUM | SUGGESTION | |
| `zod` (per-rule `impact:` frontmatter, 6 levels) | CRITICAL / HIGH | WARNING, unless it lets invalid data reach the DB or breaks a wire contract → CRITICAL | |
| | MEDIUM / LOW / others | SUGGESTION | |
| `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`, `next-best-practices`, `typescript-expert`, `react-testing-library` (no severity scale of their own) | — | judge directly against the three product-rubric definitions | never invent a level from the rule's tone |

**Asymmetry — state this explicitly, it's the single most important
calibration in this file.** `react-best-practices` and `frontend-architecture`
use "CRITICAL" to mean *"will cause bugs, broken reconciliation, or a
maintenance nightmare eventually."* That is not this repo's merge-blocking
bar. Without downgrading their CRITICAL to WARNING by default, the gate fires
on nearly every UI diff and gets ignored within a week. Only promote back to
CRITICAL when the finding independently satisfies the product definition (wrong
render / crash / data loss on a path this diff actually exercises).

## False-positive suppression

Adopting `security`'s own precedent ("report HIGH confidence only"). Report a
finding only when **all** of these hold:

1. **Mechanism traced, not pattern-matched.** State the concrete input and the
   concrete wrong behavior. Any finding whose justification leans on "might",
   "could potentially", or "if X isn't already handled elsewhere" is capped at
   WARNING — and if that's the *entire* basis, drop it instead of reporting it.
2. **Introduced or worsened by this diff.** Pre-existing code is out of scope
   unless this change amplifies it.
3. **Not already caught by tooling.** No typecheck-catchable type errors (tsc
   already covers those), no formatting nits (there is no linter in this
   repo — that's a reason to allow *architectural* style findings, not
   formatting ones).
4. **Not in an excluded path** (see [routing.md](routing.md) §1).
5. **Distinct.** One root cause → one finding. Never list the same underlying
   problem twice because two skills both flagged it — merge them, keep the
   higher severity.

## Always-CRITICAL repo invariants

These bypass the "trace the mechanism" bar because the mechanism is already
established by a `CLAUDE.md` in this repo — a violation is CRITICAL on sight,
no case-by-case judgment needed:

1. **Package-manager cross-contamination** — a `pnpm-lock.yaml` appearing under
   `reviewer-core/` or `e2e/`, a `package-lock.json` appearing under `server/`
   or `client/`, any `workspace:*` dependency, any `pnpm -r` invocation.
2. **Hand-edited or hand-numbered migration** — a change under
   `server/src/db/migrations/**` where the `.sql` file, its
   `meta/NNNN_snapshot.json`, and the `_journal.json` entry don't form one
   consistent generated set (e.g. `_journal.json` gained an entry with no
   matching new snapshot, or an existing `.sql` was modified instead of a new
   one added).
3. **`reviewer-core` purity break** — any import of db/http/fs/`process.env` in
   `reviewer-core/src/**`, a local `reviewer-core/src/vendor/`, any bypass of
   `groundFindings()`, any score taken from the model instead of recomputed
   from surviving findings.
4. **Illegal import direction** — `client → server`, `server → client`,
   `reviewer-core → either`.
5. **Network call from a React component** — `fetch`/axios/etc. in
   `client/src/**/*.tsx` outside `src/lib/api.ts` (client CLAUDE.md: all API
   access goes through `src/lib/hooks/*` → `src/lib/api.ts`).
6. **Adapter constructed inside a service** — `new <Adapter>()` in
   `server/src/modules/*/service.ts` instead of DI via
   `platform/container.ts`.
7. **Secret literal outside `LocalSecretsProvider`** — a credential in config
   or committed to the DB layer.
8. **Vendored-shared drift the wrong way** — a contract added to
   `client/src/vendor/shared` without existing in `server/src/vendor/shared`
   first.
9. **Do-not-touch path modified** — anything under `server/clones/**`.
10. **Merge-conflict markers left in a file** — `<<<<<<<`, `=======`,
    `>>>>>>>` at the start of a line, in *any* file in the diff, regardless of
    routing or exclusions. The cheapest and least ambiguous check in this
    list — always run it first.

## WARNING-level repo-ish checks

Real, worth fixing, not merge-blocking — full list and anchors live in
[repo-invariants.md](repo-invariants.md). Examples: a module not registered in
`src/modules/index.ts`, a hand-rolled `Schema.parse` in a route instead of the
zod type provider, a changed component with no colocated `*.test.tsx` touched,
an inline UI string not moved to `messages/`, a framework convention restated
inside a `CLAUDE.md`, a new/edited skill under `.claude/skills/*/SKILL.md`
whose author didn't run `skill-creator`, a deleted `service.ts`/`route.ts`
that left a dangling reference behind (see [routing.md](routing.md) §2).

## Verdict

Pure function of the (normalized, deduplicated) findings — exactly as
`general-reviewer.md` and `reviewer-core/src/output/to-review.ts` define it:

- `request_changes` iff ≥1 CRITICAL finding.
- `comment` if only WARNING/SUGGESTION findings.
- `approve` iff the findings list is empty.

Never `request_changes` with an empty list. Never `approve` while a CRITICAL
survives. No findings ⇒ approve.
