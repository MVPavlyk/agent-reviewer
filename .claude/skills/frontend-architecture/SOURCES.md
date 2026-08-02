# `frontend-architecture` — research & source list

Research pass for a planned skill about **where code goes** in a React/Next.js
codebase: folder structure, component decomposition, constants, utils/helpers,
business logic, types, state.

Status: **research only** — no `SKILL.md` written yet.
Researched: 2026-08-02.

## Scope boundary vs existing skills

| Existing skill | Owns | This skill must NOT restate |
|---|---|---|
| `react-best-practices` | component design rules, hooks misuse, perf, anti-patterns | rendering/hooks correctness |
| `next-best-practices` | App Router file conventions, RSC boundaries, data fetching | route file semantics |
| `typescript-expert` | type-level programming | type syntax |
| `react-testing-library` | test authoring | how to write tests |

The gap this skill fills: **placement and decomposition decisions** — "which
file does this go in, and at what folder level" — not "how do I write it".

---

## Q1 — Where do components live / how is the tree organized?

**Consensus found:** feature-first ("screaming architecture") is the default for
anything long-lived; group by *what it does*, not *what it is*. Start flat, add
structure when coupling demands it. Two shared layers: a generic `components/ui`
(no domain knowledge) and per-feature `features/<x>/components`. Dependency
direction is one-way: `shared → features → app`; features never import each
other.

| # | Source | URL | Why it matters |
|---|---|---|---|
| 1 | **bulletproof-react — `docs/project-structure.md`** | https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md | The reference implementation. Full `src/` layout (`app`, `assets`, `components`, `config`, `features`, `hooks`, `lib`, `stores`, `testing`, `types`, `utils`), per-feature subfolders, and the **unidirectional rule** `shared → features → app` with a concrete `eslint no-restricted-imports` config that enforces it. Primary source. |
| 2 | **bulletproof-react — `docs/project-standards.md`** | https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md | Absolute imports, ESLint/Prettier/TS strictness, file naming. |
| 3 | **Feature-Sliced Design — official docs** | https://fsd.how/docs/get-started/overview (was `feature-sliced.github.io`) | The most formal alternative: layers (App → Pages → Widgets → Features → Entities → Shared), slices (business domains), segments (`ui`/`api`/`model`/`lib`/`config`). Explicit import rule: a layer may only import from layers **below** it, never sideways within a layer. Also states when *not* to adopt it (working architecture, libraries). |
| 4 | **Robin Wieruch — React Folder Structure Best Practices [2026]** | https://www.robinwieruch.de/react-folder-structure/ | Best "growth path" narrative: flat → component-folders → feature folders. Concrete promotion rule: a util/hook moves up to shared **only when 2+ features need it**. |
| 5 | **Next.js docs — Project structure and organization** | https://nextjs.org/docs/app/getting-started/project-structure | Framework-official. Colocation is safe by default in `app/` (nothing is routable without `page`/`route`); `_private` folders; `(route-groups)`; `src/`. Lists the three sanctioned strategies: files outside `app`, files in top-level folders inside `app`, or split by feature/route. Explicitly unopinionated — "be consistent". |
| 6 | **Sandro Roth — How to structure your React projects** | https://sandroroth.com/blog/project-structure/ | Practical comparison of the same structures with trade-offs. |
| 7 | **profy.dev — Popular React Folder Structures and Screaming Architecture** | https://profy.dev/article/react-folder-structure | Origin of the "screaming architecture" framing for React; compares 7 structures. *(host was unreachable at research time — re-verify before citing)* |
| 8 | **Frontend Master — 7 ways to organize a React app (and exactly when each one breaks)** | https://rahuulmiishra.medium.com/react-folder-structure-7-ways-to-organize-a-react-app-and-exactly-when-each-one-breaks-ccb10dba68c2 | Framed as *failure modes* per structure — good raw material for a "when to escalate structure" table. |
| 9 | **dangz.dev — How to structure a React app in 2026** | https://dangz.dev/blog/how-to-structure-a-react-app-in-2026 | Recent, opinionated, feature-first. |
| 10 | **React Handbook — Project Standards** | https://reacthandbook.dev/project-standards | Endorses bulletproof-react; adds a canonical **in-file ordering** for a component (imports/constants → prop types → state → memo/callback → effects → helpers → JSX → subcomponents). Also the "don't spend >5 min planning folder structure" pragmatism line. |

## Q2 — Colocation: how close is "close enough"?

**Consensus found:** things that change together live together; push code down to
the narrowest scope that uses it, and promote it upward only on the second
consumer. Deleting a feature should be `rm -rf` + fix imports.

| # | Source | URL | Why it matters |
|---|---|---|---|
| 11 | **Kent C. Dodds — Colocation** | https://kentcdodds.com/blog/colocation | The canonical statement: "Place code as close to where it's relevant as possible." Covers files, tests, state. |
| 12 | **Kent C. Dodds — State Colocation will make your React app faster** | https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster | Colocation applied to state; the perf argument against hoisting state too high. |
| 13 | **Matias Kinnunen — Locality of Behavior / Co-location** | https://mtsknn.fi/blog/locality-of-behavior-and-co-location/ | Ties colocation to Carson Gross's Locality of Behaviour; useful counterweight to over-abstraction. |
| 14 | **Sean McP — Colocate functionally-related code** | https://www.seanmcp.com/articles/colocate-functionally-related-code/ | Short, concrete file-level examples. |

## Q3 — Where does business logic go?

**Consensus found:** three tiers. (a) Pure functions — calculations, formatting,
validation, derivations — plain modules, framework-free, trivially testable.
(b) Custom hooks — *application* logic: wiring pure functions to state, effects,
data fetching. (c) Service/api modules — network access, one per domain.
Components render. The container/presentational split is explicitly retired.

| # | Source | URL | Why it matters |
|---|---|---|---|
| 15 | **Dan Abramov — Presentational and Container Components (+ his 2019 retraction note)** | https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0 | The original pattern **and** the author's own note that it should "not be taken too seriously" now that hooks do the same separation without an arbitrary division. Needed so the skill doesn't recommend a dead pattern. |
| 16 | **Felix Gerschau — Separation of concerns with React hooks** | https://felixgerschau.com/react-hooks-separation-of-concerns/ | The modern replacement: presentational component + custom hook. |
| 17 | **profy.dev — Path to a Clean(er) React Architecture: Business Logic Separation** | https://profy.dev/article/react-architecture-business-logic-and-dependency-injection | The most rigorous treatment found: business logic vs application logic, dependency injection, testability. Part of a multi-part series worth mining. *(host unreachable at research time — re-verify)* |
| 18 | **Antony Leme — Business vs application logic: how to separate and test your React code** | https://antonyleme.medium.com/business-vs-application-logic-how-to-separate-and-test-your-reactjs-code-4291d0c983b1 | Clean two-way split with tests. |
| 19 | **patterns.dev — Container/Presentational Pattern** | https://www.patterns.dev/react/presentational-container-pattern/ | Reference description + the hooks-era caveat. |
| 20 | **DEV — RSC and the echo of presentational/container components** | https://dev.to/fibonacid/rsc-and-the-echo-of-presentational-and-container-components-33i | Argues RSC reintroduces the split at the server/client boundary — directly relevant to a Next.js skill. |

## Q4 — Utils vs helpers vs lib vs services

**Consensus found:** `utils/` and `helpers/` as generic dumping grounds are an
anti-pattern; name folders by *domain*, not by "miscellaneous". Working rule
found: **if it talks to the outside world → `lib/`; if it only reshapes your own
data → `utils/`; if it's used by one feature → it lives in that feature.**

| # | Source | URL | Why it matters |
|---|---|---|---|
| 21 | **Sergey Sova — Why utils & helpers is a dump** | https://dev.to/sergeysova/why-utils-helpers-is-a-dump-45fo | The strongest argument against `utils/`; proposes domain-named modules instead. Widely cited. |
| 22 | **DEV — Why should you avoid helpers** | https://dev.to/knzt/helpers-and-utils-folders-in-software-architecture-3f8h | Same argument from a clean-code/naming angle. |
| 23 | **DEV — Are utils a code smell?** | https://dev.to/noway/are-utils-folder-where-you-put-random-stuff-you-don-t-know-where-to-put-otherwise-a-code-smell-3054 | Counter-discussion; keeps the skill from being dogmatic. |
| 24 | **Ali Bey — Libs vs Utils vs Services folders** | https://medium.com/@a.m.housen/libs-vs-utils-vs-services-folders-simple-explanation-for-developers-0ae961539a0f | Source of the "outside world → lib, organize logic → utils" heuristic. |
| 25 | **Understanding the role of libs and utils in a Next.js 15 project** | https://khaisastudio.medium.com/understanding-the-role-of-libs-and-utils-in-a-next-js-15-project-b1c0368ef044 | Next-specific: why `lib/` became the server-side core (actions, queries, schemas) and must not import from `components/` or `app/`. |

## Q5 — Where do constants go?

**Consensus found:** narrow scope first (module-level `const` above the
component), promote to a feature-level `constants.ts` when shared, and only then
to a global `constants/` split into **contextual files** (never one giant
`constants.ts`). Env/config is a separate concern from domain constants —
validate env once in a `config/env.ts`. A dissenting view: a value used in one
narrow scope is not a magic number and does not need extracting.

| # | Source | URL | Why it matters |
|---|---|---|---|
| 26 | **Semaphore — How to organize constants in a dedicated layer in JavaScript** | https://semaphore.io/blog/constants-layer-javascript | The most structured treatment: a constants *layer*, split contextually, with naming rules. |
| 27 | **Callan Delbridge — JavaScript Project Architecture: Constants** | https://medium.com/@z_callan/javascript-project-architecture-constants-deddfde3c8a8 | Splitting one `constants.js` into contextual files as the project grows; content/string constants kept out of code. |
| 28 | **Codex — When magic numbers are not magic ("Stop creating constants")** | https://medium.com/codex/when-magic-numbers-are-not-magic-fcdf034295a5 | The necessary counter-argument: constants are implementation details; don't extract inside a narrow scope. Prevents a cargo-cult rule. |
| 29 | **freeCodeCamp — How to improve your React code** | https://www.freecodecamp.org/news/improve-reactjs-code/ | General readability rules incl. constant extraction. |

## Q6 — Where do TypeScript types go?

**Consensus found:** identical rule to everything else — inline/colocate
single-use types; extract to a folder-level `*.types.ts` on the second consumer;
a global `src/types/` only for genuinely cross-cutting contracts. Reserve `.d.ts`
strictly for ambient declarations.

| # | Source | URL | Why it matters |
|---|---|---|---|
| 30 | **Total TypeScript (Matt Pocock) — Where to put your types in application code** | https://www.totaltypescript.com/where-to-put-your-types-in-application-code | Authoritative, three crisp rules (colocate single-use → shared `*.types.ts` at the right folder level → shared package in a monorepo). Primary source for this question. |
| 31 | **OpenReplay — How to organize type definitions in a TypeScript project** | https://blog.openreplay.com/organize-typescript-type-definitions/ | `.ts` vs `.d.ts` discipline; barrel trade-offs for types. |
| 32 | **Wisp — How should I organize my types as a React developer?** | https://www.wisp.blog/blog/how-should-i-organize-my-types-as-a-react-developer | Concrete React folder examples of the same progression. |

## Q7 — Where does state go?

**Consensus found:** the first question is *who owns the data*, not *which
library*. Server-owned data → TanStack Query (or RSC/Server Actions); URL-owned
data (filters, tabs, pagination) → the URL; client-owned persistent data →
Zustand w/ persist; client-owned ephemeral data → local `useState`, colocated as
low as possible.

| # | Source | URL | Why it matters |
|---|---|---|---|
| 33 | **React State Management in 2026: A Decision Tree, Not a Religion** | https://www.aiwisdom.dev/articles/frontend-react/state-management | The clearest server-vs-client-state decision tree found; explicitly frames library choice as secondary. |
| 34 | **Server State vs Client State in React 2026** | https://nextfuture.io.vn/blog/react-server-state-vs-client-state-guide | Taxonomy: persistent/ephemeral × server/client, with the placement for each cell. |
| 35 | **The State of React State Management in 2026 — PkgPulse** | https://www.pkgpulse.com/blog/state-of-react-state-management-2026 | Ecosystem snapshot; sanity-check on defaults. |
| 36 | *(see #12 — Kent C. Dodds, state colocation)* | | The "push state down" rule. |

## Q8 — Component decomposition: when to split?

**Consensus found:** no line-count threshold. Split on **reasons to change**:
if you need "and" to describe the component, or it fetches + transforms +
manages state + renders, split it — usually by moving logic into a hook first,
UI into subcomponents second.

| # | Source | URL | Why it matters |
|---|---|---|---|
| 37 | **Dmitri Pavlutin — 7 architectural attributes of a reliable React component** | https://dmitripavlutin.com/7-architectural-attributes-of-a-reliable-react-component/ | The most rigorous single article on component decomposition (SRP, encapsulation, composability, reusability). Evergreen. |
| 38 | **cekrem — Single Responsibility Principle in React: the art of component focus** | https://cekrem.github.io/posts/single-responsibility-principle-in-react/ | The "one reason to change" heuristic applied to components. |
| 39 | **Abbas Roholamin — Splitting a UI into components: six pillars** | https://medium.com/@abbas-roholamin/splitting-a-ui-into-components-in-react-six-pillars-of-component-architecture-04538e542ce5 | Practical splitting heuristics. |
| 40 | **React docs — Thinking in React** | https://react.dev/learn/thinking-in-react | Official: break the UI into a component hierarchy from the design, single responsibility per component. |
| 41 | **React docs — Reusing logic with custom hooks** | https://react.dev/learn/reusing-logic-with-custom-hooks | Official guidance on when logic becomes a hook. |
| 42 | **React docs — You might not need an Effect** | https://react.dev/learn/you-might-not-need-an-effect | Official: derived values belong in render/pure functions, not effects — a placement question as much as a correctness one. |

## Q9 — Enforcing the structure (so it doesn't rot)

**Consensus found:** a folder convention that isn't linted is a suggestion.
Enforce feature isolation and layer direction mechanically.

| # | Source | URL | Why it matters |
|---|---|---|---|
| 43 | **eslint-plugin-boundaries** | https://github.com/javierbrea/eslint-plugin-boundaries · https://www.npmjs.com/package/eslint-plugin-boundaries | Declare architectural element types and allowed dependencies; instant in-editor feedback. |
| 44 | **dependency-cruiser** | https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/ | Rule-based dependency validation + graph visualisation; CI-side complement to ESLint. |
| 45 | **Steve Kinney — Architectural linting (Enterprise UI course)** | https://stevekinney.com/courses/enterprise-ui/architectural-linting-exercise | Hands-on exercise wiring the above into a real project. |
| 46 | **Frontend at Scale — The Beyoncé Rule** ("if you liked it you should have put a test on it") | https://frontendatscale.com/issues/36/ | Argument for encoding architecture rules as automated checks. |
| 47 | *(see #1 — bulletproof-react `no-restricted-imports` config)* | | Zero-dependency way to get 80% of the enforcement. |

## Q10 — Barrel files (`index.ts`): yes or no?

**Consensus found (has flipped since ~2023):** barrels at the *feature* boundary
(one public API per feature) are still defended; barrels re-exporting large
component/icon sets hurt bundle size, tree-shaking and dev build times. Next.js
ships `optimizePackageImports` specifically to work around them. Recommendation
for the skill: one thin barrel per feature (explicit named exports, never
`export *`), no barrels inside a feature.

| # | Source | URL | Why it matters |
|---|---|---|---|
| 48 | **Steven Lemon — Are TypeScript barrel files an anti-pattern?** | https://steven-lemon182.medium.com/are-typescript-barrel-files-an-anti-pattern-72a713004250 | The balanced analysis: circular imports, IDE cost, when barrels still pay off. |
| 49 | **DEV — Barrel files and why you should STOP using them now** | https://dev.to/tassiofront/barrel-files-and-why-you-should-stop-using-them-now-bc4 | The against case, with measurements. |
| 50 | **Catch Metrics — Next.js barrel files bundle size improvements** | https://www.catchmetrics.io/blog/nextjs-bundle-size-improvements-optimize-your-performance | Concrete numbers (400 KB bundle drop; 15–70% faster dev builds) + `optimizePackageImports`. |
| 51 | **Why I will not use index files in 2025** | https://medium.com/@aleksandr_ross/why-i-will-not-use-index-files-in-2025-b40db08dab00 | Refactoring/DX cost of barrels. |

## Q11 — Next.js-specific placement (server/client)

**Consensus found:** the `"use client"` boundary is a *placement* decision.
Keep it as low in the tree as possible; pass Server Components as `children`/
props into Client Components instead of importing them. Make the boundary
visible in the filesystem: `lib/` (server-safe core: actions, queries, schemas,
auth) must never import from `components/` or `app/`; `hooks/` and `stores/` are
implicitly client-side.

| # | Source | URL | Why it matters |
|---|---|---|---|
| 52 | **Next.js docs — Server and Client Components** | https://nextjs.org/docs/app/getting-started/server-and-client-components | Official boundary semantics and composition patterns. |
| 53 | **Vercel Academy — Client/Server component boundaries** | https://vercel.com/academy/nextjs-foundations/client-server-boundaries | Official teaching material on where to draw the line. |
| 54 | **Next.js docs — `src` folder convention** | https://nextjs.org/docs/app/api-reference/file-conventions/src-folder | Official `src/` rules. |
| 55 | **Strapi — Mastering `use client` in Next.js** | https://strapi.io/blog/use-client-next-js-client-component-guide | The three signals that force a client component (hooks, event handlers, browser APIs). |
| 56 | **GroovyWeb — Next.js folder structure best practices for 2026** | https://www.groovyweb.co/blog/nextjs-project-structure-full-stack | Source of the `lib/` vs `hooks/`+`stores/` filesystem-visible boundary rule. |
| 57 | **Next.js Colocation Template** | https://next-colocation-template.vercel.app/ | A runnable reference repo for colocated App Router structure. |

## Q12 — Naming conventions & the shared UI layer

| # | Source | URL | Why it matters |
|---|---|---|---|
| 58 | **Sufle — Naming conventions in React for clean & scalable code** | https://www.sufle.io/blog/naming-conventions-in-react | Consolidated component/file/folder/handler/constant naming. |
| 59 | **Shipixen — Next.js file naming best practices** | https://shipixen.com/blog/nextjs-file-naming-best-practices | The kebab-case-for-files camp, incl. case-insensitive-FS argument. |
| 60 | **Iceland Digital — ADR 0009: unified naming strategy for files and directories** | https://docs.devland.is/technical-overview/adr/0009-naming-files-and-directories | A real organisation's ADR — good model for writing our rule as a decision, not a preference. |
| 61 | **kettanaito — Naming Cheatsheet** | https://github.com/kettanaito/naming-cheatsheet | Referenced by React Handbook; the A/HC/LC pattern for function names. |
| 62 | **shadcn/ui** | https://ui.shadcn.com/ | De-facto 2026 baseline for the shared UI layer (`components/ui`), and why it's copied-in rather than a dependency. |
| 63 | **shadcn/ui best practices for 2026** | https://medium.com/write-a-catalyst/shadcn-ui-best-practices-for-2026-444efd204f44 | The `ui/` (raw) → `primitives/` (adapted) → `blocks/` (product compositions) three-tier split for the shared layer. |
| 64 | **Brad Frost — Atomic Design** | https://atomicdesign.bradfrost.com/ | Historical baseline; the skill should say why atoms/molecules/organisms folders are *not* recommended as a filesystem layout while the vocabulary survives. |

---

## Decisions (settled 2026-08-02)

1. **Default structure** — bulletproof-react's feature-first layout is the
   single prescribed default. FSD (#3) gets its own "when you outgrow this"
   section, not equal billing.
2. **`utils/` / `helpers/`** — strict. `helpers/` is banned as a folder name
   outright. `utils/` is allowed **only** for small, generic, domain-free
   functions (`formatDate`, `uniqueId`). Anything that knows about the domain
   goes in a domain-named module. Sources #21–#25.
3. **Barrel files** — exactly one thin `index.ts` per feature, explicit named
   exports, **never `export *`**. No barrels inside a feature. Sources #48–#51.
4. **Audience** — universal React/Next rules, but reconciled against this
   repo's `client/` so the skill never contradicts it; divergences called out
   explicitly.

## Reconciliation with this repo's `client/` (checked 2026-08-02)

Read: [`client/CLAUDE.md`](../../../client/CLAUDE.md), `client/src/` tree.

**Already aligned — use as the skill's worked examples:**
- Thin `page.tsx`, feature logic in colocated `_components/<Name>/` with its own
  `*.test.tsx`. This is Next's sanctioned "split by feature or route" strategy
  (#5) plus colocation (#11).
- All API access funnelled through `src/lib/hooks/*` (TanStack Query) →
  `src/lib/api.ts`. Exactly the Q3 three-tier rule and the Q7 server-state rule.
- **No `utils/` and no `helpers/` anywhere.** Shared logic lives in
  domain-named modules: `lib/github-urls.ts`, `lib/model-label.ts`,
  `lib/feature-models.ts`. This is decision #2 already in practice.
- UI strings externalised to `messages/<locale>/*.json` — stronger than the
  "content constants" advice in #27.

**Divergence to state explicitly in the skill:**
- There is no `src/features/` directory. Feature code is colocated under route
  segments (`src/app/**/_components/`), with `src/components/` holding the
  cross-route shared layer. The skill must present route-segment colocation as
  a legitimate variant of feature-first for App Router projects, not as a
  violation — otherwise it will flag this codebase's own conventions.

**Live evidence for the barrel rule (#48–#51):** `client/CLAUDE.md` documents a
real bundle bug — importing a runtime *value* from `vendor/shared/index.ts`
drags the whole barrel into the webpack bundle; see
`client/src/lib/feature-models.ts` for the workaround. Use this as the concrete
example instead of a synthetic one.

## Remaining chores

- **Drop #7 and #17 (profy.dev)** — host does not resolve (`ENOTFOUND`,
  retried). Replace the screaming-architecture citation with #8/#9 and the
  business-logic citation with #16/#18, or find an archive.org mirror.
- Skim `client/INSIGHTS.md` for further structural decisions worth encoding.
