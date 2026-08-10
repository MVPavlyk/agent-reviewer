# Frontend Architecture — Examples

Concrete before/after for each rule in [SKILL.md](SKILL.md). Where possible,
examples are drawn from this repo's `client/` package rather than invented.

---

## Colocate, Then Promote

```
// BAD — jumped straight to "shared" for a value one component uses
src/utils/formatCheckoutTotal.ts
src/features/checkout/components/CheckoutSummary.tsx   (imports the above)

// GOOD — starts local...
src/features/checkout/components/CheckoutSummary.tsx
  function formatCheckoutTotal(cents: number) { ... }   // defined right here

// ...and only moves out once a SECOND consumer shows up
src/features/checkout/utils/format-checkout-total.ts    // now 2+ components use it
```

Don't skip straight to the top-level `utils/` for a function with one caller.
Move it when the second caller appears, not before.

---

## Default Project Structure

```
src/
├── app/                       # routes, root providers
├── components/ui/             # Button, Input, Card — no domain knowledge
├── features/
│   ├── auth/
│   │   ├── api/login.ts
│   │   ├── components/LoginForm.tsx
│   │   ├── hooks/useSession.ts
│   │   ├── types.ts
│   │   └── index.ts           # public entry point — see Barrel Files below
│   └── checkout/
│       ├── api/createOrder.ts
│       ├── components/CheckoutForm.tsx
│       ├── hooks/useCheckout.ts
│       ├── types.ts
│       └── index.ts
├── hooks/                      # useDebounce, useMediaQuery — cross-feature
├── lib/                        # httpClient.ts, analytics.ts — talks outward
└── types/                      # ApiEnvelope<T> — genuinely cross-cutting
```

```ts
// BAD — checkout reaches directly into auth's internals
import { useSession } from '@/features/auth/hooks/useSession';
// (import path pierces a feature that isn't `auth`'s own index.ts)

// GOOD — checkout goes through auth's public surface
import { useSession } from '@/features/auth';
```

## Next.js Route-Segment Colocation

This repo's `client/` doesn't have a top-level `features/` directory — and
that's fine. It applies the same feature-first principle using Next's route
segments instead, which is a Next-sanctioned variant, not a deviation:

```
src/app/
├── agents/
│   ├── page.tsx                 # thin — renders _components only
│   └── _components/
│       └── AgentList/
│           ├── AgentList.tsx
│           └── AgentList.test.tsx
└── onboarding/
    ├── page.tsx
    └── _components/
```

`_components/` (underscore-prefixed) opts the folder out of routing, so it's
safe to colocate feature code right next to the route that owns it — this is
the "split by feature or route" strategy Next's own docs list as sanctioned.
Cross-route shared UI still lives in the top-level `src/components/`.

When reviewing a Next.js App Router project, don't flag route-segment
colocation as "missing a `features/` folder" — check whether it follows the
*principle* (feature code stays together, shared code is promoted once used
by 2+ routes), not whether it matches the SPA folder names literally.

---

## Business Logic Tiers

```tsx
// BAD — component does everything: fetch, transform, render
function OrderSummary({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState(null);
  useEffect(() => {
    fetch(`/api/orders/${orderId}`)
      .then(r => r.json())
      .then(data => setOrder({ ...data, total: data.items.reduce((s, i) => s + i.price, 0) }));
  }, [orderId]);
  if (!order) return <Spinner />;
  return <div>{order.total}</div>;
}
```

```tsx
// GOOD — three tiers, each independently testable

// 1. Pure function — no framework, no I/O
function calculateOrderTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// 2. Custom hook — application logic: wires fetching + the pure function together
function useOrder(orderId: string) {
  const { data, isLoading } = useApiQuery(['order', orderId], () => fetchOrder(orderId));
  const total = useMemo(() => data && calculateOrderTotal(data.items), [data]);
  return { order: data, total, isLoading };
}

// 3. Component — renders only
function OrderSummary({ orderId }: { orderId: string }) {
  const { total, isLoading } = useOrder(orderId);
  if (isLoading) return <Spinner />;
  return <div>{total}</div>;
}
```

This repo already does this — see the pattern in
[`client/src/lib/api.ts`](../../../client/src/lib/api.ts) and
`client/src/lib/hooks/*`: components call a hook, the hook calls `api.ts`,
never the other way around.

---

## Utils vs Domain Modules

```
// BAD
src/utils/helpers.ts
  export function formatGithubUrl(...) { ... }   // knows about GitHub's URL shape
  export function calculatePrice(...) { ... }     // knows about the domain's pricing model
  export function debounce(...) { ... }           // generic — this one IS fine in utils/

// GOOD — domain-aware functions get domain-named modules
src/lib/github-urls.ts      // formatGithubUrl, parseRepoSlug — GitHub-specific
src/lib/model-label.ts      // pricing/model-label logic — domain-specific
src/utils/debounce.ts       // generic, no domain knowledge — utils/ is correct here
```

This repo's `client/` already follows this — see
[`client/src/lib/github-urls.ts`](../../../client/src/lib/github-urls.ts) and
[`client/src/lib/model-label.ts`](../../../client/src/lib/model-label.ts).
There is no `utils/` or `helpers/` grab-bag in this codebase; keep it that way.

---

## Barrel File Bundle Cost

This is not a theoretical rule — this exact codebase has hit it:

> Importing a runtime **value** from `vendor/shared/index.ts` pulls the whole
> barrel into the webpack bundle, whose `./contracts/*.js` re-exports
> webpack can't resolve.
> — [`client/CLAUDE.md`](../../../client/CLAUDE.md), Gotchas

The workaround lives in
[`client/src/lib/feature-models.ts`](../../../client/src/lib/feature-models.ts):
rather than importing the `FEATURE_MODELS` runtime value through the barrel,
the client maintains its own mirrored copy with a comment explaining why.

```ts
// BAD — importing a runtime value through a barrel that re-exports everything
import { FEATURE_MODELS } from '@/vendor/shared';   // drags in the whole barrel

// GOOD (this repo's actual fix) — mirror the value locally, document why
// see client/src/lib/feature-models.ts in full
export const FEATURE_MODELS: FeatureModelDef[] = [ /* ... */ ];
```

The general rule this supports: a feature's `index.ts` should list explicit
named exports, never `export *`, and should never be relied on for
tree-shaking a large registry — pull the one value you need, or (as here)
avoid the barrel entirely for large runtime exports.

---

## Types Placement

```ts
// BAD — extracted for one caller "to be tidy"
type ButtonSize = 'sm' | 'md' | 'lg';   // in its own file, used by exactly one component

// GOOD — inlined, since it's single-use
function Button({ size }: { size: 'sm' | 'md' | 'lg' }) { ... }

// GOOD — promoted once a second component needs the same shape
// features/checkout/types.ts
export type PaymentMethod = 'card' | 'paypal' | 'bank-transfer';
// used by both CheckoutForm.tsx and PaymentSelector.tsx
```

---

## State Ownership

```tsx
// BAD — server data mirrored into local state, now two sources of truth
function RepoList() {
  const [repos, setRepos] = useState([]);
  useEffect(() => { fetchRepos().then(setRepos); }, []);
  // now `repos` can silently drift from the server
}

// GOOD — TanStack Query owns server data, component just reads the cache
function RepoList() {
  const { data: repos } = useApiQuery(['repos'], fetchRepos);
}
```

```tsx
// BAD — filter state lost on refresh, can't be shared via link
const [statusFilter, setStatusFilter] = useState('open');

// GOOD — URL owns it
const searchParams = useSearchParams();
const statusFilter = searchParams.get('status') ?? 'open';
```

---

## `"use client"` Boundary Placement

```tsx
// BAD — the whole page becomes a client component for one interactive widget
'use client';
export default function DashboardPage({ data }) {
  return (
    <div>
      <ServerRenderedHeader data={data} />  {/* now bundled to the client too */}
      <InteractiveChart data={data} />
    </div>
  );
}
```

```tsx
// GOOD — boundary pushed down to just the interactive piece
// page.tsx — stays a Server Component
export default function DashboardPage({ data }) {
  return (
    <div>
      <ServerRenderedHeader data={data} />
      <InteractiveChart data={data} />   {/* only this file has 'use client' */}
    </div>
  );
}

// InteractiveChart.tsx
'use client';
export function InteractiveChart({ data }) { /* hooks, event handlers here */ }
```
