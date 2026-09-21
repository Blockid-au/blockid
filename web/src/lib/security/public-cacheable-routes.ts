/**
 * Public, anonymous, shared-cacheable routes — the S31-D allow-list.
 *
 * A route listed here is served, when `CSP_PUBLIC_HASH_MODE=1` and the
 * request carries no session / locale cookie, with
 *   • the nonce-less hash CSP built from its prerendered document
 *     (`lib/security/prerender-script-hashes.ts`), and
 *   • `Cache-Control: public, s-maxage=<sMaxAge>, stale-while-revalidate=<swr>`
 *     so Cloudflare (cache rule: cookie `blockid_session` absent) and an
 *     optional nginx micro-cache can serve it without touching Node.
 *
 * Everything NOT listed keeps today's behaviour: per-request nonce CSP +
 * `private, no-store`. The list is deliberately explicit (no "everything
 * under (marketing)") so a page that starts reading cookies or a session
 * can never leak into a shared cache by accident; the companion test
 * `public-cacheable-routes.test.ts` walks every listed page's server import
 * tree and fails on `next/headers`, `connection()`, `noStore()`,
 * `searchParams` or `force-dynamic`.
 *
 * `sMaxAge` mirrors the page's `revalidate` export so the edge never holds
 * a document longer than the origin would; `swr` lets the edge serve the
 * stale copy while it refetches one fresh one (no thundering herd).
 *
 * `pages` are `src/app`-relative page files the pattern serves — the guard
 * test reads them; keep them in sync when moving a page.
 */

export interface PublicCacheableRoute {
  /** Exact pathname, or a RegExp tested against the pathname. */
  match: string | RegExp;
  /** Shared-cache TTL in seconds (Cloudflare `s-maxage`). */
  sMaxAge: number;
  /** `stale-while-revalidate` window in seconds. */
  staleWhileRevalidate: number;
  /** `src/app`-relative page files served by this pattern (for the static guard). */
  pages: readonly string[];
  /** Human label for docs / logs. */
  label: string;
}

const FIVE_MIN = 300;
const TEN_MIN = 600;
const ONE_HOUR = 3600;

export const PUBLIC_CACHEABLE_ROUTES: readonly PublicCacheableRoute[] = [
  { label: "home", match: "/", sMaxAge: FIVE_MIN, staleWhileRevalidate: TEN_MIN, pages: ["(marketing)/page.tsx"] },
  { label: "pricing", match: "/pricing", sMaxAge: FIVE_MIN, staleWhileRevalidate: TEN_MIN, pages: ["(marketing)/pricing/page.tsx"] },
  { label: "about", match: "/about", sMaxAge: ONE_HOUR, staleWhileRevalidate: ONE_HOUR, pages: ["(marketing)/about/page.tsx"] },
  {
    label: "funding landing",
    match: "/funding",
    sMaxAge: TEN_MIN,
    staleWhileRevalidate: TEN_MIN,
    pages: ["(marketing)/funding/page.tsx"],
  },
  {
    label: "grants directory (base + per-state landing pages)",
    // `/funding/grants?state=NSW` is rewritten by the proxy onto the static
    // `/funding/grants/state/NSW` route; every other filter combination is
    // rewritten onto the dynamic `/funding/grants/view` (NOT listed here).
    match: /^\/funding\/grants(?:\/state\/[A-Za-z]+)?$/,
    sMaxAge: TEN_MIN,
    staleWhileRevalidate: TEN_MIN,
    pages: ["(marketing)/funding/grants/page.tsx", "(marketing)/funding/grants/state/[state]/page.tsx"],
  },
  {
    label: "grant detail",
    match: /^\/funding\/grants\/(?!state$|view$)[A-Za-z0-9_\-~]+$/,
    sMaxAge: TEN_MIN,
    staleWhileRevalidate: TEN_MIN,
    pages: ["(marketing)/funding/grants/[id]/page.tsx"],
  },
  {
    label: "programs by capital + program detail",
    // `/funding/programs` itself filters off `searchParams` and stays dynamic.
    match: /^\/funding\/programs\/[A-Za-z0-9_\-~]+(?:\/[A-Za-z0-9_\-~]+)?$/,
    sMaxAge: TEN_MIN,
    staleWhileRevalidate: TEN_MIN,
    pages: ["(marketing)/funding/programs/[capital]/page.tsx", "(marketing)/funding/programs/[capital]/[id]/page.tsx"],
  },
  {
    label: "startup index",
    // `/startup-index/listings` (no ticker) filters off `searchParams`
    // (sector / stage / sort) and stays dynamic — not matched.
    match: /^\/startup-index(?:\/listings\/[A-Za-z0-9_\-~]+)?$/,
    sMaxAge: FIVE_MIN,
    staleWhileRevalidate: FIVE_MIN,
    pages: ["startup-index/page.tsx", "startup-index/listings/[ticker]/page.tsx"],
  },
  {
    label: "compare",
    match: /^\/compare(?:\/[A-Za-z0-9_\-~]+)?$/,
    sMaxAge: ONE_HOUR,
    staleWhileRevalidate: ONE_HOUR,
    pages: ["(marketing)/compare/page.tsx", "(marketing)/compare/[slug]/page.tsx"],
  },
  {
    label: "insights",
    match: /^\/insights(?:\/[A-Za-z0-9_\-~]+)?$/,
    sMaxAge: ONE_HOUR,
    staleWhileRevalidate: ONE_HOUR,
    pages: ["(marketing)/insights/page.tsx", "(marketing)/insights/[slug]/page.tsx"],
  },
  {
    label: "showcase",
    // `/showcase/blockid/report` is excluded (negative lookahead): its Assessment
    // Card context changes on the server between deploys (nightly benchmark
    // segments, claims), so the ISR document regenerates with a new flight chunk
    // while the hash-mode header still lists the previous document's hashes —
    // the CSP inline-script block seen 2026-09-21. It renders per request in
    // nonce mode; its data is cached 1 h by lib/showcase/blockid-report.ts.
    match: /^\/showcase(?!\/blockid\/report$)(?:\/[A-Za-z0-9_\-~]+)*$/,
    sMaxAge: ONE_HOUR,
    staleWhileRevalidate: ONE_HOUR,
    pages: [
      "showcase/page.tsx",
      "showcase/airwallex/page.tsx",
      "showcase/atlassian/page.tsx",
      "showcase/atlassian/agents/page.tsx",
      "showcase/atlassian/agents/[slug]/page.tsx",
      "showcase/atlassian/dashboard/page.tsx",
      "showcase/atlassian/data-room/page.tsx",
      "showcase/atlassian/growth-phases/page.tsx",
      "showcase/atlassian/guide/page.tsx",
      "showcase/atlassian/summary/page.tsx",
      "showcase/atlassian/svi-report/page.tsx",
      "showcase/atlassian/valuation/page.tsx",
      "showcase/blockid/page.tsx",
      "showcase/canva/page.tsx",
      "showcase/culture-amp/page.tsx",
      "showcase/safetyculture/page.tsx",
      "showcase/sprocketbay/page.tsx",
      "showcase/xero/page.tsx",
    ],
  },
  {
    label: "solutions",
    match: /^\/solutions(?:\/[A-Za-z0-9_\-~]+)?$/,
    sMaxAge: ONE_HOUR,
    staleWhileRevalidate: ONE_HOUR,
    pages: [
      "(marketing)/solutions/page.tsx",
      "(marketing)/solutions/accelerator/page.tsx",
      "(marketing)/solutions/advisor/page.tsx",
      "(marketing)/solutions/founder/page.tsx",
      "(marketing)/solutions/investor/page.tsx",
      "(marketing)/solutions/vn-sme/page.tsx",
    ],
  },
  {
    label: "docs",
    match: /^\/docs(?:\/[A-Za-z0-9_\-~]+)*$/,
    sMaxAge: ONE_HOUR,
    staleWhileRevalidate: ONE_HOUR,
    pages: ["docs/page.tsx", "docs/design-system/page.tsx", "docs/startup-package/page.tsx", "(marketing)/docs/unlocks/page.tsx", "(marketing)/docs/api/institutional/page.tsx"],
  },
  {
    label: "legal",
    match: /^\/legal(?:\/[A-Za-z0-9_\-~]+)?$/,
    sMaxAge: ONE_HOUR,
    staleWhileRevalidate: ONE_HOUR,
    pages: ["(marketing)/legal/page.tsx", "(marketing)/legal/acceptable-use/page.tsx", "(marketing)/legal/[doc]/page.tsx"],
  },
];

/** The allow-list entry for a pathname, or null when the route is not shared-cacheable. */
export function publicCacheableRoute(pathname: string): PublicCacheableRoute | null {
  for (const r of PUBLIC_CACHEABLE_ROUTES) {
    if (typeof r.match === "string" ? r.match === pathname : r.match.test(pathname)) return r;
  }
  return null;
}

/** `public, s-maxage=…, stale-while-revalidate=…` for an allow-listed route. */
export function publicCacheControl(route: PublicCacheableRoute): string {
  return `public, s-maxage=${route.sMaxAge}, stale-while-revalidate=${route.staleWhileRevalidate}`;
}

/** What every non-cacheable HTML response carries (today's default, made explicit). */
export const PRIVATE_CACHE_CONTROL = "private, no-cache, no-store, max-age=0, must-revalidate";

/** Runtime flag: `CSP_PUBLIC_HASH_MODE=1` turns shared caching on. Read per request so it can be flipped without a code change. */
export function publicHashModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CSP_PUBLIC_HASH_MODE === "1";
}
