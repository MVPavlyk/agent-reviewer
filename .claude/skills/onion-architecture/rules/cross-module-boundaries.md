# A module's repository is private to that module

[rules/vertical-slices.md](vertical-slices.md) establishes that the Onion
ring rule applies *inside* each `modules/<name>/` slice, not across the repo
as a whole. This rule names the violation that falls out of that: **one
module reaching directly into a sibling module's `repository.ts` instead of
going through its `service.ts`.**

## Why this is the same rule, at a different boundary

[rules/dependency-direction.md](dependency-direction.md) treats
"`service.ts` querying Drizzle directly" as a violation because it lets
application code skip the layer meant to own persistence decisions. Crossing
a module boundary into another module's repository is the identical mistake,
just sideways instead of inward: `modules/pulls/service.ts` importing
`modules/repos/repository.ts` skips `repos/service.ts` — the layer that
owns validation, caching, and derived fields for that data — the same way
skipping `pulls/repository.ts` would skip persistence-shaping for pulls.

A module's `repository.ts` is not a shared data-access utility. It is the
private storage detail of that module's own three-file slice
(`routes.ts` → `service.ts` → `repository.ts`, per
[rules/layers.md](layers.md)). Nothing outside the module should know it
exists.

## Concrete violation shape to flag in review

```ts
// modules/pulls/service.ts — VIOLATION: reaches into a sibling module's
// private repository instead of calling its service
import { getRepoConfig } from '../repos/repository';

export async function shouldAutoMerge(owner: string, repo: string) {
  const config = await getRepoConfig(owner, repo);
  return config?.autoMergeEnabled ?? false;
}
```

Fix: `modules/repos/service.ts` exports `getRepoConfig` (or a narrower
`isAutoMergeEnabled`) as part of its public surface; `pulls/service.ts`
depends on `repos`' service, not its repository:

```ts
// modules/pulls/service.ts
import { getRepoConfig } from '../repos/service';
```

This isn't pedantry about import paths — `repos/service.ts` may enforce
invariants (a repo with no default branch can't have auto-merge enabled,
config caching, feature-flag gating) that `pulls` has no business
re-deriving or, worse, silently skipping.

## What's *not* a violation

- Importing another module's exported **types** (`RepoConfig`, `PullRow`) —
  types are the module's public contract, not its private storage.
- Depending on `modules/_shared/` — code there is explicitly shared, not
  owned by a single feature slice.
- Two modules' `repository.ts` files both reading the same underlying table
  when that's a deliberate, narrow read — flag it only when the *decision
  logic* that should live in the owning module's service is what's being
  bypassed, not every incidental table overlap.
