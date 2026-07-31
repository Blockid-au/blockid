"use client";

import dynamic from "next/dynamic";

/**
 * Client-side lazy boundary for {@link SVIEntrance}.
 *
 * WHY THIS FILE EXISTS — measured, not speculative.
 *
 * `(marketing)/page.tsx` renders one of three heroes depending on feature
 * flags: HeroV3 (`NEXT_PUBLIC_UPGRADE_V3`), HeroSearch (`NEXT_PUBLIC_UPGRADE_V2`)
 * or, if neither flag is set, the legacy `<SVIEntrance />`. Production runs
 * with `NEXT_PUBLIC_UPGRADE_V2=true`, so the legacy branch **never renders** —
 * but a *static* `import { SVIEntrance }` still puts its whole client subtree
 * into the route's First Load JS, because a Server Component that statically
 * imports a Client Component registers it in the route's client-reference
 * manifest regardless of whether the branch is taken.
 *
 * That dead import cost the homepage 645 KB of the 1597 KB it shipped:
 *   - recharts            307 KB  (via svi-entrance → rnd-results-panel → svi-radar-chart)
 *   - SVI feature UI      228 KB  (the svi-entrance/results-panel tree itself)
 *   - react-markdown      110 KB  (via svi-entrance → svi-results-panel)
 * Every other marketing route ships ~848 KB and carries none of it.
 *
 * The fix has to live in a Client Component. Per Next 16's lazy-loading guide
 * (`node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`): "When a
 * Server Component dynamically imports a Client Component, automatic code
 * splitting is currently **not** supported." So calling `dynamic()` directly
 * inside the server `page.tsx` would not have split anything. Hoisting the
 * `dynamic()` call into this `"use client"` module is what actually produces a
 * separate, lazily-fetched chunk.
 *
 * `ssr` is deliberately left at its default (`true`) so behaviour is
 * unchanged when the flags are off: the legacy hero still server-renders, it
 * is merely fetched as its own chunk instead of riding in First Load. This is
 * a pure code-splitting change, not a rendering change.
 */
const SVIEntranceDynamic = dynamic(() =>
  import("@/components/svi/svi-entrance").then((m) => m.SVIEntrance),
);

export function SVIEntranceLazy() {
  return <SVIEntranceDynamic />;
}
