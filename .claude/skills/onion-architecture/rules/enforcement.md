# Enforcing the rule mechanically

A layering rule nobody lints is a suggestion that erodes on the first
deadline. This repo already has the tool needed — no new dependency.

## `dependency-cruiser` is already installed

`server/package.json` has `"dependency-cruiser": "^17.4.3"` — currently used
programmatically inside `server/src/adapters/depgraph/index.ts` to analyze
the dependency graph of **imported/cloned repos** (`server/clones/**`) as
part of repo-intel. There is no `.dependency-cruiser.cjs` config for this
repo's own `server/src`.

Proposal: add a self-lint config, e.g. `server/.dependency-cruiser.cjs`,
with rules shaped like:

```js
module.exports = {
  forbidden: [
    {
      name: 'no-infra-imports-in-service',
      comment:
        'service.ts (application layer) must not import Drizzle, the db client, or Fastify directly — go through repository.ts or the route layer.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/service\\.ts$' },
      to: { path: '^src/db/(client|schema)\\.ts$|^node_modules/(drizzle-orm|fastify)' },
    },
    {
      name: 'domain-is-pure',
      comment:
        'A future domain.ts/helpers.ts/findings.ts business-rule file must not import framework or infra code.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/(domain|helpers|findings)\\.ts$' },
      to: {
        path: '^src/db/|^src/adapters/|^node_modules/(fastify|drizzle-orm|octokit|@octokit)',
      },
    },
  ],
  options: { tsPreCompilationDeps: true, tsConfig: { fileName: 'tsconfig.json' } },
};
```

Wire it as a `pnpm` script (`"lint:arch": "depcruise src --config .dependency-cruiser.cjs"`)
and, once stable, into the same CI job that runs `pnpm typecheck` per
`server/CLAUDE.md`'s Commands section — not a new workflow file.

## Alternative / complement: `eslint-plugin-boundaries`

[eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries)
gives the same rule as in-editor ESLint feedback instead of a separate CI
step. Worth adding only if editor-time feedback proves more valuable than
CI-time — evaluate after the `dependency-cruiser` config exists and has
caught at least one real violation, don't add both preemptively.

## Rollout order

1. Write the config with only the two rules above (import-direction, domain
   purity) — don't try to encode every nuance from `rules/layers.md` at once.
2. Run it against current `server/src` and read the violations as data: they
   either confirm a real gap (like the `AgentRow` case in
   [dependency-direction.md](dependency-direction.md)) or reveal the rule
   needs a narrower `from`/`to` path.
3. Land it non-blocking (report-only) for one iteration, then flip to
   blocking in CI once false positives are gone.
