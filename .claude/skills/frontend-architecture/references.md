# References

Sources behind the rules in [SKILL.md](SKILL.md), grouped by topic. Full
research notes (including sources that didn't make the cut, and open
questions resolved along the way) are in [SOURCES.md](SOURCES.md).

## Project structure & feature-first organization

- [bulletproof-react — project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — the reference `src/` layout and the unidirectional `shared → features → app` rule this skill's default structure is built on, incl. a concrete ESLint config.
- [bulletproof-react — project-standards.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md) — absolute imports, lint/format strictness, naming.
- [Feature-Sliced Design — official docs](https://fsd.how/docs/get-started/overview) — layers/slices/segments and the formal import rule behind the "When to Escalate" section.
- [Robin Wieruch — React Folder Structure Best Practices](https://www.robinwieruch.de/react-folder-structure/) — the flat → component-folders → feature-folders growth path, and the "promote on 2nd consumer" rule.
- [Next.js docs — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) — official colocation semantics, private (`_folder`) folders, route groups, and the sanctioned organization strategies behind the App Router variant section.
- [React Handbook — Project Standards](https://reacthandbook.dev/project-standards) — endorses bulletproof-react; source of the in-file ordering convention and "don't over-plan folders" pragmatism.

## Colocation principle

- [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) — the canonical statement of "place code as close to where it's relevant as possible."
- [Kent C. Dodds — State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) — colocation applied specifically to state.

## Business logic placement

- [Dan Abramov — Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) — the original pattern, plus the author's own note that hooks have superseded it; why this skill retires container/presentational.
- [Felix Gerschau — Separation of concerns with React hooks](https://felixgerschau.com/react-hooks-separation-of-concerns/) — the modern replacement: presentational component + custom hook.
- [Antony Leme — Business vs application logic](https://antonyleme.medium.com/business-vs-application-logic-how-to-separate-and-test-your-reactjs-code-4291d0c983b1) — the pure-function / hook / component three-tier split used in this skill.

## Utils, helpers, lib

- [Sergey Sova — Why utils & helpers is a dump](https://dev.to/sergeysova/why-utils-helpers-is-a-dump-45fo) — the core argument behind banning `helpers/` and restricting `utils/` to generic, domain-free functions.
- [Ali Bey — Libs vs Utils vs Services folders](https://medium.com/@a.m.housen/libs-vs-utils-vs-services-folders-simple-explanation-for-developers-0ae961539a0f) — source of the "talks to the outside world → `lib/`" heuristic.

## Constants

- [Semaphore — How to organize constants in a dedicated layer](https://semaphore.io/blog/constants-layer-javascript) — the contextual-files-not-one-big-file rule.
- [Codex — When magic numbers are not magic ("Stop creating constants")](https://medium.com/codex/when-magic-numbers-are-not-magic-fcdf034295a5) — the counter-argument for not extracting narrow-scope values, kept as the "don't over-extract" caveat.

## Types

- [Total TypeScript (Matt Pocock) — Where to put your types in application code](https://www.totaltypescript.com/where-to-put-your-types-in-application-code) — the three-rule progression (inline → `*.types.ts` → shared package) this skill's Types section is built on.

## State ownership

- [React State Management in 2026: A Decision Tree, Not a Religion](https://www.aiwisdom.dev/articles/frontend-react/state-management) — the server-vs-client-state decision tree behind the State Ownership section.
- [Server State vs Client State in React 2026](https://nextfuture.io.vn/blog/react-server-state-vs-client-state-guide) — the persistent/ephemeral × server/client taxonomy.

## Component decomposition

- [Dmitri Pavlutin — 7 architectural attributes of a reliable React component](https://dmitripavlutin.com/7-architectural-attributes-of-a-reliable-react-component/) — the most rigorous treatment found of when/how to split a component.
- [React docs — Thinking in React](https://react.dev/learn/thinking-in-react) — official single-responsibility-per-component guidance.

## Enforcement tooling

- [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) — declares architectural element types and legal dependencies.
- [Taking Frontend Architecture Serious With Dependency-cruiser](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/) — CI-side dependency validation and graph visualization.

## Barrel files

- [Steven Lemon — Are TypeScript barrel files an anti-pattern?](https://steven-lemon182.medium.com/are-typescript-barrel-files-an-anti-pattern-72a713004250) — balanced analysis behind the "one thin barrel, never `export *`" rule.
- [Catch Metrics — Next.js barrel files bundle size improvements](https://www.catchmetrics.io/blog/nextjs-bundle-size-improvements-optimize-your-performance) — the measured bundle-size and dev-build-time cost that makes this a hard rule, not a style preference.

## Next.js server/client boundary

- [Next.js docs — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) — official boundary semantics and composition patterns.
- [Vercel Academy — Client/Server component boundaries](https://vercel.com/academy/nextjs-foundations/client-server-boundaries) — official teaching material on where to draw the line.
