/**
 * Query-URL → internal route rewrites, executed by Next's router (G36).
 *
 * `src/proxy.ts` decides which route serves a filtered public URL
 * (`grantsRewriteTarget`, `demoBandRewriteTarget`) because the CSP shape
 * (hash vs nonce) and the Cache-Control depend on the route that renders.
 * It used to hand that decision to `NextResponse.rewrite(url)`. Behind nginx
 * on this box that rewrite was never internal: Next normalises the
 * proxy's URL host (127.0.0.1 → `localhost`) while the router compares it
 * with the bind address (`http(s)://127.0.0.1:<port>`), so every filtered
 * page was proxied back to its own origin over HTTP — double work,
 * `Failed to proxy … ECONNRESET`, nginx 500/499s and a cold-candidate
 * deploy gate failure.
 *
 * Now the proxy only stamps its decision on the request
 * (`INTERNAL_ROUTE_HEADER: <target path>`, via `NextResponse.next({ request })`)
 * and these `beforeFiles` rewrites — which run right after the proxy, in
 * the router, in-process — map the public URL onto that target. The query
 * string is carried over unchanged, exactly like the old rewrite.
 *
 * Invariants (pinned by `internal-route-rewrites.test.ts`):
 *   - every target the proxy can emit matches exactly one rule and lands on
 *     that same path; nothing else matches (so proxy CSP and served route
 *     can never disagree);
 *   - the rules never fire on a request the proxy did not see: prefetches
 *     skip the proxy (its matcher), so they are `missing` here too, and the
 *     proxy deletes any client-supplied header before stamping its own.
 *
 * Dependency-light on purpose: imported by `next.config.ts` and the proxy.
 * Relative imports only (next.config is compiled outside the `@/` alias).
 */

import { AU_STATES } from "../funding/seed-map";
import { DEMO_BANDS } from "../report-v2/demo-band-route";

/** Request header the proxy uses to tell the router which route serves the URL. */
export const INTERNAL_ROUTE_HEADER = "x-blockid-internal-route";

type RouteHas = { type: "header"; key: string; value?: string };

/** Structurally a Next `Rewrite` (next.config `rewrites()`), with has/missing always present. */
export interface InternalRouteRewrite {
  source: string;
  destination: string;
  has: RouteHas[];
  missing: RouteHas[];
}

/** Same exclusions as the proxy `config.matcher` — those requests never reach the proxy. */
const PROXY_SKIPPED: RouteHas[] = [
  { type: "header", key: "next-router-prefetch" },
  { type: "header", key: "purpose", value: "prefetch" },
];

const routeIs = (pattern: string): RouteHas[] => [{ type: "header", key: INTERNAL_ROUTE_HEADER, value: pattern }];

/** `beforeFiles` rewrites for next.config.ts. */
export function internalRouteRewrites(): InternalRouteRewrite[] {
  return [
    {
      source: "/funding/grants",
      has: routeIs("/funding/grants/view"),
      missing: PROXY_SKIPPED,
      destination: "/funding/grants/view",
    },
    {
      source: "/funding/grants",
      has: routeIs(`/funding/grants/state/(?<grantsState>${AU_STATES.join("|")})`),
      missing: PROXY_SKIPPED,
      destination: "/funding/grants/state/:grantsState",
    },
    {
      source: "/tbr/demo",
      has: routeIs(`/tbr/demo/band/(?<demoBand>${DEMO_BANDS.join("|")})`),
      missing: PROXY_SKIPPED,
      destination: "/tbr/demo/band/:demoBand",
    },
  ];
}
