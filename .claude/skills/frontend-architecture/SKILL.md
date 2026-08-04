---
name: frontend-architecture
description: "Where React/Next.js code should live: folder structure, feature vs shared layers, component decomposition, constants, utils vs domain modules, business logic tiers, types placement, state ownership, and barrel-file (index.ts) conventions. Use whenever creating new files, scaffolding a feature, deciding which folder or file something belongs in, reviewing/refactoring a project's structure, or placing the 'use client' boundary in the file tree. Does not cover component/hook correctness or render-time bugs (see react-best-practices), route-file conventions or RSC data-fetching semantics (see next-best-practices), type-level programming (see typescript-expert), or import specifier hygiene like alias-vs-relative-path or barrel routing (see import-hygiene)."
---

# Frontend Architecture — Where Code Goes

Placement and decomposition rules for React/Next.js codebases: which file,
which folder, which level. For component/hook correctness see
`react-best-practices`; for App Router file conventions see
`next-best-practices`. For code examples see [examples.md](examples.md); for
the research behind each rule see [references.md](references.md).

## Severity Levels

- **CRITICAL** — Will cause circular imports, un-deletable features, or a
  codebase that actively fights you as it grows
- **HIGH** — Will cause duplicated logic, bloated bundles, or slow onboarding
- **MEDIUM** — Will hurt discoverability and consistency

---

## The One Governing Principle (CRITICAL)

**Colocate by default. Promote on the second consumer, not the first.**

- New code starts in the narrowest scope that could possibly need it: inside
  the component file, then the component's folder, then the feature, then
  shared.
- Move something up a level only when a **second** consumer actually needs it
  — not "might need it," not "feels reusable." One consumer = premature
  abstraction.
- Corollary: deleting a feature should be `rm -rf features/<x>/` (or
  `rm -rf app/<x>/`) plus fixing a handful of imports. If deleting a feature
  requires archaeology across the codebase, colocation has already failed.

Everything below is this principle applied to a specific question.

---

## Default Project Structure (CRITICAL)

Feature-first ("screaming architecture") is the default for any project
expected to outlive a prototype. Group by **what the code does** (checkout,
auth, repo-import), not by **what kind of file it is** (all hooks together,
all components together).

```
src/
├── app/                  # SPA: routes, root providers, router
│                         # (Next.js: this is the App Router itself)
├── components/           # ui/ — generic, project-agnostic building blocks
│   └── ui/               #        (buttons, inputs, cards — no domain knowledge)
├── features/
│   └── checkout/
│       ├── api/          # network calls for this feature only
│       ├── components/   # feature-specific components
│       ├── hooks/         # feature-specific hooks
│       ├── stores/        # feature-specific client state (if any)
│       ├── types.ts       # feature-specific types
│       └── index.ts       # the ONE public entry point (see Barrel Files)
├── hooks/                # cross-feature hooks only
├── lib/                  # code that talks to the outside world
├── types/                # genuinely cross-cutting contracts only
└── config/               # env parsing, feature flags
```

**Dependency direction is one-way: `shared → features → app`.**
- `components/`, `hooks/`, `lib/`, `types/` may be imported by anything.
- A feature may **never** import from another feature. If two features need
  the same thing, promote it to `shared`, or split it out as its own feature
  that both depend on.
- `app/` composes features; features never import from `app/`.

Enforce this mechanically — see [Enforcement](#enforcement-critical) below.
A structure nobody lints is a suggestion, not a rule.

### Next.js App Router variant

Next.js makes route segments themselves a valid place to colocate feature
code — nothing under `app/**` is routable unless it exports `page`/`route`, so
a `_components/`, `_hooks/`, `_lib/` folder next to a route is safe. This is
feature-first too; `features/` and route-segment colocation are the **same
principle**, not competing conventions. Don't flag one as violating the other.
Pick one per project and stay consistent — see
[examples.md](examples.md#nextjs-route-segment-colocation) for a real example.

Route-agnostic shared code (the `ui/` layer, cross-route hooks, `lib/`) still
lives at the top level, outside `app/`.

---

## Placement Decision Table

| Question | Where it goes |
|---|---|
| Used by exactly one component? | Inline in that component's file |
| Used by 2+ components in the same feature? | That feature's `components/`, `hooks/`, or `types.ts` |
| Used by 2+ features? | Promote to top-level `components/`, `hooks/`, `types/` |
| Talks to the outside world (HTTP, storage, third-party SDK)? | `lib/` |
| Pure transform on your own data (format, sort, parse — no I/O)? | A domain-named module (`currency.ts`, `github-urls.ts`) — see [Utils](#utils-vs-domain-modules-high) |
| Server-owned data (fetched from an API)? | TanStack Query (or RSC/Server Actions in Next.js) |
| Filter/tab/pagination state that should survive a refresh or be shareable? | URL search params |
| Client-owned state that should persist (theme, sidebar collapsed)? | A store (Zustand, etc.) with persistence |
| Client-owned ephemeral state (modal open, hover, draft input)? | Local `useState`, in the component that needs it |

---

## Business Logic (CRITICAL)

Three tiers. A component's job is to render — nothing else lives there.

1. **Pure functions** — calculations, formatting, validation, derivations.
   Framework-free plain modules. Take arguments, return a value, no side
   effects. Trivially unit-testable without React.
2. **Custom hooks** — *application* logic: wiring pure functions to state,
   effects, and data fetching. This is where "business logic in components"
   actually belongs once extracted.
3. **API/service modules** — network access, one module per domain, always
   behind a hook (see Placement Table). Components never call `fetch` (or
   equivalent) directly.

The "container/presentational component" split is **retired** — Dan Abramov,
its original author, has said as much since hooks arrived. Don't reintroduce
it. Hooks already give the separation that pattern was trying to provide,
without an arbitrary component split.

---

## Component Decomposition (CRITICAL)

No line-count threshold is reliable on its own, but 200 lines is a reasonable
smell-test trigger to go looking. Split on **reasons to change**, not size:

- If describing what a component does requires the word "and" (fetches data
  **and** transforms it **and** manages open/closed state **and** renders),
  it has too many responsibilities.
- Extract stateful/data logic into a custom hook first. Extract UI into
  subcomponents second.
- A component with more than 5-7 props is usually doing too much, or needs
  composition (`children`) instead of more props.

---

## Constants (MEDIUM)

Follow the same colocate-then-promote rule:

1. **Narrow scope** — a `const` above the component that uses it. A value used
   in one place with no ambiguity is *not* a magic number; don't extract it
   just to have a constants file.
2. **Feature scope** — a `constants.ts` in the feature, once 2+ files in that
   feature need the value.
3. **Global scope** — a top-level `constants/` directory, split into
   **contextual files** (`constants/pagination.ts`, `constants/routes.ts`) —
   never one giant `constants.ts` that becomes a junk drawer.

Environment/config values (API base URLs, feature flags) are a different
concern from domain constants — validate them once in `config/env.ts`, not
scattered through the constants layer.

---

## Types (MEDIUM)

Same rule again, applied to `type`/`interface`:

1. **Single-use** — inline it, even directly in a function signature. Don't
   pre-extract "for tidiness."
2. **Shared within a folder** — extract to a `*.types.ts` at the folder level
   that needs it, once a second file needs the same shape.
3. **Cross-cutting** — a top-level `types/` directory, only for contracts that
   genuinely span features (e.g. an API response envelope).

Reserve `.d.ts` files strictly for ambient/global declarations (env vars,
global augmentations) — never for types you import explicitly.

---

## Utils vs Domain Modules (HIGH)

`helpers/` is a banned folder name in this codebase's convention set. `utils/`
is allowed, but only for small, **generic, domain-free** functions —
`formatDate`, `uniqueId`, `debounce`. The moment a function knows about your
domain (a repo, a PR, a review, a price), it does not belong in `utils/` — it
belongs in a domain-named module (`github-urls.ts`, `model-label.ts`,
`currency.ts`), colocated at the level (feature or shared) that needs it.

Rule of thumb for the `utils/` vs `lib/` boundary: **if it talks to the
outside world, it's `lib/`; if it only reshapes data you already have, it's
`utils/` (or better, a domain module).**

A folder named `utils/` or `helpers/` that becomes a dumping ground for
unrelated functions is the single most common way frontend codebases rot.
Watch for it in review.

---

## State Ownership (HIGH)

The first question is **who owns the data**, not which library to reach for:

- **Server-owned** (the backend has authority, other clients might change it):
  TanStack Query / RSC. Never mirror it into local `useState`.
- **URL-owned** (filters, active tab, pagination, search query — anything a
  user would expect to survive a refresh or be shareable via link): URL search
  params.
- **Client-owned, persistent** (theme, sidebar collapsed, recent searches): a
  small store (Zustand or similar) with a persistence layer.
- **Client-owned, ephemeral** (modal open, hover state, an unsubmitted draft):
  local `useState`, colocated in the component that needs it — don't lift it
  higher "just in case."

---

## Barrel Files (HIGH)

**One thin `index.ts` per feature, with explicit named exports. Never
`export *`. No barrels inside a feature** (i.e. don't add `index.ts` files to
`components/`, `hooks/`, etc. *within* a feature — only the feature's own
root gets one).

```ts
// features/checkout/index.ts — the feature's ONE public entry point
export { CheckoutForm } from './components/CheckoutForm';
export { useCheckout } from './hooks/useCheckout';
```

Why the restriction: barrel files that re-export large sets (icon libraries,
component kits) via `export *` measurably hurt bundle size and tree-shaking,
and slow down dev builds — this is a real, measured problem, not a style
nitpick. See [examples.md](examples.md#barrel-file-bundle-cost) for a bundle
bug this exact pattern caused in this codebase.

---

## Next.js: Where the `"use client"` Boundary Lives (HIGH)

The client/server boundary is a placement decision, not just a correctness
one:

- Components are Server Components by default. Only add `"use client"` when a
  file needs hooks, event handlers, or browser APIs.
- Push the boundary as **low** in the tree as possible. Don't put `"use
  client"` at a layout or page level "to be safe" — it drags everything below
  it into the client bundle.
- Compose instead of importing: pass a Server Component as `children` or a
  prop into a Client Component, rather than importing a Server Component from
  inside a Client Component (which is impossible) or making the whole subtree
  client.
- Make the boundary visible in the filesystem: `lib/` (Server Actions, DB
  queries, schemas, auth) should never import from `components/` or `app/`.
  Anything in `hooks/` or a client `stores/` is implicitly client-side —
  keeping them out of `lib/` makes the boundary legible without reading every
  file.

---

## Naming (MEDIUM)

- Components: `PascalCase.tsx`, one component per file.
- Everything else (hooks, utils, types, constants): match the project's
  existing case convention and stay consistent — don't introduce a second
  casing scheme into a codebase that already picked one.
- Custom hooks: `useX` — the prefix is not optional, tooling and lint rules
  depend on it.
- Prefer descriptive domain names over generic ones: `github-urls.ts`, not
  `helpers2.ts`.

---

## Enforcement (CRITICAL)

An architecture convention nobody lints will rot within a few PRs. Pick one:

- **Cheapest**: `no-restricted-imports` (ESLint, no extra dependency) blocking
  feature-to-feature imports and shared-importing-from-features.
- **More expressive**: `eslint-plugin-boundaries` — declare architectural
  element types and legal dependencies between them, enforced at edit time.
- **CI-side / visual**: `dependency-cruiser` — validates the same rules in CI
  and can render the dependency graph, useful for catching violations ESLint
  missed and for onboarding.

Start with `no-restricted-imports`; escalate to `eslint-plugin-boundaries` or
`dependency-cruiser` once the ruleset outgrows what import-path globbing can
express.

---

## When to Escalate to Feature-Sliced Design (MEDIUM)

Feature-first as described above is enough for most projects. Escalate to
full [Feature-Sliced Design](https://fsd.how) — layers (App → Pages → Widgets
→ Features → Entities → Shared), slices, segments, and a formal import rule —
only when:

- The team is large enough that "who owns this folder" is a real question.
- Features have started depending on each other in ways `no-restricted-imports`
  can no longer express cleanly.
- Entities (a "user", a "repo") are shared across many features and need their
  own layer beneath features, not just a `components/` grab bag.

Don't adopt FSD because it's more formal — adopt it when the informal version
above is visibly failing. FSD's own docs make the same point: don't switch if
the current architecture isn't causing trouble, and don't use it for library
projects.
