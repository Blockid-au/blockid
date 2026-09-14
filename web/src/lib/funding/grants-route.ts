/**
 * `/funding/grants` URL contract → internal route (S31-D).
 *
 * The public URLs are unchanged (`/funding/grants`, `/funding/grants?state=NSW`
 * is the self-canonicalising state landing page, any other chip
 * combination is a view of the base page — S8-A). What changed is how
 * they are rendered so the two indexable shapes can be static + edge-cached:
 *
 *   /funding/grants                    → app/(marketing)/funding/grants/page.tsx          (static, ISR)
 *   /funding/grants?state=NSW          → …/grants/state/[state]/page.tsx  (static, generateStaticParams)
 *   /funding/grants?type=…&stage=…&…   → …/grants/view/page.tsx           (dynamic: reads searchParams)
 *
 * The proxy performs the rewrite (URL in the address bar stays the same);
 * this module is the pure decision so it is unit-testable. `null` means
 * "no rewrite".
 *
 * Dependency-light on purpose: imported by the proxy, so no Supabase, no
 * `next/headers`.
 */

import { AU_STATES } from "@/lib/funding/seed-map";

const FILTER_KEYS = ["state", "type", "stage", "status"] as const;
const GRANTS = "/funding/grants";

function normaliseState(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!/^[A-Za-z]{1,12}$/.test(t)) return null;
  const s = t.toLowerCase() === "national" ? "national" : t.toUpperCase();
  return (AU_STATES as readonly string[]).includes(s) ? s : null;
}

/** Path the request should be rewritten to, or null to serve the URL as-is. */
export function grantsRewriteTarget(pathname: string, search: URLSearchParams): string | null {
  if (pathname !== GRANTS) return null;
  const present = FILTER_KEYS.filter((k) => (search.get(k) ?? "").trim().length > 0);
  if (present.length === 0) return null;
  if (present.length === 1 && present[0] === "state") {
    const state = normaliseState(search.get("state"));
    // Unknown state → the base page ignores it today (parseGrantFilters
    // upper-cases junk that then matches nothing); keep that on the
    // dynamic view so the response is not a cached "no grants" page.
    return state ? `${GRANTS}/state/${state}` : `${GRANTS}/view`;
  }
  return `${GRANTS}/view`;
}

/** Static params for the per-state landing pages (every AU state + national). */
export function grantsStateParams(): Array<{ state: string }> {
  return AU_STATES.map((state) => ({ state }));
}
