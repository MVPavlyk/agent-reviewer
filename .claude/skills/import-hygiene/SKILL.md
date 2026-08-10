---
name: import-hygiene
description: "Picking the right import specifier in this repo's four packages — when to use the client's `@/*` alias vs a relative path, when to import through an existing barrel (`index.ts`) instead of reaching into a submodule, and why WebStorm's 'Import can be shortened' inspection is sometimes a false positive that would break the app at runtime if applied. Use whenever adding, editing, or reviewing an import statement (or a vitest `vi.mock()` path) in client/, server/, reviewer-core/, or e2e/. Does not cover where a new file itself should live (see frontend-architecture) or backend layering/coupling direction (see onion-architecture) — this skill is only about the specifier text once the file's location is already decided."
---

# Import Hygiene

Four packages, three different resolution setups. The right import specifier
depends on which one you're in — get it wrong and you either write a WebStorm
warning into the diff, or "fix" a warning in a way that breaks at runtime.

## Severity Levels
- **HIGH** — Applying an IDE "shorten" suggestion that breaks Node ESM
  resolution at runtime (see Trap below)
- **MEDIUM** — Deep relative import where a shorter alias or barrel exists;
  inconsistent `vi.mock()` path vs. the real import
- **LOW** — Cosmetic (import ordering, grouping) — not this skill's concern

---

## 1. `client/`: prefer `@/*` over deep relative paths (MEDIUM)

`client/tsconfig.json` maps `@/*` → `./src/*`. Once an import climbs out of
the current feature's own folder tree to reach `src/lib/`, `src/components/`,
or `src/vendor/`, use the alias:

```ts
// ❌ crossed out of the feature folder via ../../../../../
import { useSkills } from "../../../../../lib/hooks/skills";
import { AppShell } from "../../../../components/app-shell";

// ✅
import { useSkills } from "@/lib/hooks/skills";
import { AppShell } from "@/components/app-shell";
```

**Don't** apply this inside a feature's own tree — `./styles`, `./constants`,
or a one-level-up `../../styles` between a component and its `_components/`
child are already shortest-possible and are the colocation pattern
(`frontend-architecture` owns why they're colocated; this skill just says
don't alias-ify what's already short).

**`messages/<locale>/*.json` has no alias** — it lives outside `src/`
entirely, so `@/*` can't reach it. A deep relative import into `messages/` is
correct as-is; do not try to "fix" it.

**`vi.mock()` paths must mirror the real import.** If a test aliases the
import to `@/lib/hooks/skills`, the matching `vi.mock("@/lib/hooks/skills", …)`
call must use the same specifier — vitest resolves by path, and a mismatched
pair (one aliased, one relative) is a signal something was only half-updated.

## 2. `server/` and `reviewer-core/`: import through a closer barrel (MEDIUM)

No `@/*` alias here. Instead, check for an `index.ts` barrel in an ancestor
directory that already re-exports the symbol — e.g. `server/src/adapters/index.ts`
re-exports every concrete adapter and the mocks:

```ts
// ❌ reaches past an existing barrel
import { LocalSecretsProvider } from '../adapters/secrets/local.js';
import { MockGitClient } from '../src/adapters/mocks.js';

// ✅ — both are re-exported by adapters/index.ts
import { LocalSecretsProvider, MockGitClient } from '../adapters/index.js';
```

Before doing this, **open the barrel and confirm the symbol is actually
re-exported** — don't assume. Some submodules deliberately have their own
barrel but aren't rolled into the parent one (see the Trap below for why that
split sometimes exists on purpose), and importing through the wrong barrel
can pull in `onion-architecture`-forbidden edges (e.g. a domain module must
never import the adapters barrel just because it's "closer" — the barrel
route only applies within already-permitted import directions).

## 3. The false-positive trap: don't drop the `.js` / `/index.js` (HIGH)

`server/tsconfig.json` and `reviewer-core/tsconfig.json` set
`"moduleResolution": "Bundler"`, which lets TypeScript (and WebStorm's
language service) resolve extensionless and directory-style imports. But the
actual runtime is plain Node ESM via compiled `.js` output, which has no
implicit directory index resolution and requires literal extensions. That
mismatch means WebStorm will sometimes flag an already-correct import:

```ts
// This is CORRECT and required at runtime — do not "shorten" it.
import { FflateArchiveReader } from '../adapters/archive/index.js';
import { DepCruiseGraph } from '../adapters/depgraph/index.js';
```

If WebStorm suggests dropping the `/index.js` or the `.js` extension on a
`server/` or `reviewer-core/` import, **that suggestion is the false
positive** — applying it produces code that type-checks but crashes at
runtime with `ERR_MODULE_NOT_FOUND`. The tell: the suggestion removes a
literal `.js`/`/index.js` rather than routing through an ancestor barrel.
Compare against §2 — barrel consolidation is real, extension-dropping is not.

`client/` doesn't have this trap: Next.js's bundler resolves extensionless
imports at both dev-time and build-time, so `client/` imports never carry
`.js` suffixes in the first place.

## 4. `e2e/`: same npm/ESM rules as `reviewer-core/`, no alias

`e2e/` has no `@/*` mapping either. It's a small package (`run.ts` +
`lib/assert.ts` + `specs/*.flow.json`) — barrel consolidation rarely applies
because there's essentially one entry point. The extension trap in §3 still
applies to any `.ts` imports here.

## Workflow: before adding a new import

1. Which package? → client uses `@/*`; server/reviewer-core/e2e use barrels
   + explicit extensions; e2e is mostly self-contained.
2. Does a closer barrel already re-export the symbol? Open it and check —
   don't guess. If yes, route through it (§1/§2).
3. Is the "shorten" suggestion removing a `.js`/`/index.js` in server or
   reviewer-core? If yes, ignore it (§3) — it would break the runtime build.
4. In a test, does `vi.mock()` (or any string-path mock) match the specifier
   the real import now uses? Update both together.
5. After changing imports, run that package's `typecheck` and its test suite
   — a false-positive "fix" from §3 still compiles clean in the IDE but fails
   at actual `node` runtime, which typecheck alone won't catch for a
   `moduleResolution: Bundler` project. Prefer running the tests too.
