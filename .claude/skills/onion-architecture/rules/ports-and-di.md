# Ports, adapters, and the composition root

Onion Architecture builds on Ports & Adapters (Hexagonal): the core owns
interfaces ("ports") for everything it needs from the outside world; adapters
implement those ports; a single composition root wires concrete adapters to
the interfaces at startup.
([arc42](https://quality.arc42.org/approaches/hexagonal-architecture),
[Wikipedia](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)))

This repo already has this working for cross-cutting adapters. This rule is
about extending the same shape to per-module repositories, and not
accidentally breaking the existing one.

## What already exists — don't reinvent

- **Ports**: `server/src/vendor/shared/adapters.ts` declares `AuthProvider`,
  `SecretsProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`,
  `LLMProvider`. These are the interfaces application code depends on.
- **Adapters**: `server/src/adapters/**` — `OctokitGitHubClient`,
  `SimpleGitClient`, `RipgrepCodeIndex`, `OpenAIProvider`,
  `AnthropicProvider`, `OpenAIEmbedder`, `LocalSecretsProvider`,
  `LocalNoAuthProvider` — one concrete implementation per port.
- **Composition root**: `server/src/platform/container.ts`. It is the only
  file that imports every concrete adapter class. Application code (services)
  receives the already-resolved `Container`, never constructs an adapter
  itself. [`server/CLAUDE.md`](../../../server/CLAUDE.md): "Never construct
  an adapter inside a service."
- **Test seam**: `ContainerOverrides` lets tests substitute
  `src/adapters/mocks.ts` implementations without touching application code —
  this is the testability payoff Onion is for. If a test needs to mock
  something and can't do it through `ContainerOverrides`, that's a signal the
  code under test is reaching past its ports.

## Extending the pattern: per-module repository ports

Cross-cutting adapters (LLM, GitHub, git, embeddings) already go through
ports. Per-module data access (`modules/<name>/repository.ts`) currently
does **not** — `service.ts` depends on the concrete `ReviewRepository` class,
not an interface.

This is an acceptable simplification, not a violation to fix by default:
Drizzle's own query builder is already a fairly strong abstraction over SQL,
and adding an interface + a second implementation that will never exist is
the "define contracts nobody implements twice" anti-pattern. Only extract a
formal repository interface when:
- a test genuinely needs a fake repository (rare — most tests here use a
  real Postgres via testcontainers, see `server/CLAUDE.md`'s `.it.test`
  convention), or
- the same aggregate needs two real backing stores (hasn't happened in this
  repo).

Default: keep `service.ts` depending on the concrete `XRepository` class by
type (structural typing already gives you substitutability if you ever need
it), and reserve interface extraction in `@devdigest/shared` for adapters
that cross the `server`/`reviewer-core` boundary or genuinely have multiple
implementations today.

## Composition-root discipline

When adding a new adapter:
1. Declare the interface in `server/src/vendor/shared/adapters.ts` (or mirror
   into `client/src/vendor/shared` only if the UI needs it — see root
   `CLAUDE.md`'s "Shared contracts" section).
2. Implement it under `server/src/adapters/<kind>/`.
3. Wire it in `platform/container.ts`'s `Container` construction, exposed via
   `ContainerOverrides` for tests.
4. Application code (`service.ts`) depends on the interface type only, never
   `import { ConcreteAdapter } from '../../adapters/...'`.

If a `service.ts` needs to import a concrete adapter class directly, that's
the dependency-direction violation described in
[dependency-direction.md](dependency-direction.md).
