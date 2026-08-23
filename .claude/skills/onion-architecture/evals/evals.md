# onion-architecture evals

Test suite for the `onion-architecture` skill: does it help a reviewer catch
Onion Architecture layering violations that a general-purpose review would
otherwise miss or under-explain?

## What's here

- `evals.json` — the eval cases: for each, a prompt, the files to review, and
  `expectations` (assertions a grader checks against the reviewer's findings).
- `fixtures/` — the code under review. Each fixture is written to look like an
  ordinary file from this repo (`server/src/modules/...`, `reviewer-core/src/...`)
  and has **no comments or naming that hints at the seeded issues** — a
  reviewer has to actually recognize the violation, not read a label.

| Case | Fixture | Simulates | Seeded violations |
|---|---|---|---|
| 1 | `fixtures/case-1-notifications-service/service.ts` | a Fastify + Drizzle service | Fastify types in a service signature; direct Drizzle queries bypassing a repository; a concrete adapter (Octokit) constructed inline instead of injected |
| 2 | `fixtures/case-2-reviewer-core-summary/summarize.ts` | a reviewer-core function | `node:fs` read; `process.env` read; raw `fetch()` to an LLM API instead of going through the `LLMProvider` interface |
| 3 | `fixtures/case-3-labels-routes/{routes,domain,repository}.ts` | a routes/domain/repository module | business logic computed inline in the route handler; `domain.ts` importing a Drizzle-inferred row type from `repository.ts`; the route calling the repository directly with no service layer |
| 4 | `fixtures/case-4-pulls-cross-module/service.ts` | a service reaching outside its own module | direct Drizzle queries inside `service.ts` (control, already covered by case 1); `service.ts` importing a sibling module's `repository.ts` twice instead of its `service.ts` — the violation `rules/cross-module-boundaries.md` was added to name |
| 5 | `fixtures/case-5-agents-notifications/{service,repository,slack-adapter}.ts` | a bigger (130-line, 3-file) module with mostly-correct DI and one subtle exception | `NotificationSender` declared inside `slack-adapter.ts` and imported by `service.ts` from there instead of a neutral shared location — the hard finding `rules/port-ownership.md` was added to name, since the constructor injection around it looks entirely correct; plus two controls (a concrete adapter constructed inline, a direct Drizzle query) |

Each case has exactly 3 seeded violations, one per `expectations` entry, so a
grader can score hit-rate directly instead of eyeballing prose. Case 5 adds a
4th expectation checking the *absence* of false positives on the file's
legitimate constructor-injected dependencies — a fixture with only violations
in it can't tell you whether the skill over-flags correct code.

**Case 5 runs 5 reviewers per configuration, not 1.** A single run can't
distinguish "the skill is unreliable" from "this run got unlucky" — case 5's
hard finding (port ownership) is exactly the kind of violation where that
matters: 5 old-skill runs came back 4/5, 1/5 missing it entirely even after
explicitly examining the file, while 5 new-skill runs (with the dedicated
`rules/port-ownership.md` worked example) came back 5/5. See
`aggregate_benchmark.py`'s stddev output for this — a 3/3 or 4/4 on a single
run looks identical whether the underlying hit rate is 100% or 80%.

**Note on case 4:** its cross-module import shape closely mirrors the
illustrative example already written inside `rules/cross-module-boundaries.md`
itself, so a with-skill run can recognize it almost by name rather than by
generalizing — a real weakness in this case as a test of the rule. A future
revision should reseed it with different names/shape than the rule's own
example to make it a cleaner test.

## How it's meant to be run

This suite follows the `skill-creator` eval flow (see the `skill-creator`
skill for the full mechanics): for each case, spawn two independent reviewers
on the same fixture — one with the `onion-architecture` skill loaded, one
without (baseline) — then grade both against the same `expectations` and
compare. Run output (raw findings, `grading.json`, `benchmark.json`) is
ephemeral and lives in the gitignored `.claude/skills/onion-architecture-workspace/`
sibling directory, regenerated per run — it isn't checked in.

There's no CI script wired up yet; that's the next step for this suite. When
it exists, it should read `evals.json`, run both configurations per case, and
fail the build on a hit-rate regression against the `expectations`.

## Adding a case

1. Add a fixture under `fixtures/<case-name>/` styled after a real file in
   this repo's `server/` or `reviewer-core/` — no comments naming the
   problem.
2. Seed ~3 violations the skill's rules (`rules/layers.md`,
   `rules/dependency-direction.md`, etc.) actually cover.
3. Add an entry to `evals.json` with a `prompt`, the `files`, and one
   `expectations` string per seeded violation.
