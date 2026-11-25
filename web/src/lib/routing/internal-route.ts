/**
 * Which public URLs are served by a different internal route (G36 tick 3).
 *
 * `/funding/grants?state=NSW`, `/funding/grants?type=…` and
 * `/tbr/demo?band=A` keep their query URLs, but the page that renders them
 * is another route (`/funding/grants/state/NSW`, `/funding/grants/view`,
 * `/tbr/demo/band/A`). The proxy stamps that decision on the request and the
 * next.config `beforeFiles` rewrites carry it out (internal-route-rewrites.ts).
 *
 * That only works for document requests. The App Router never asks the
 * server about these URLs the same way: prefetches skip the proxy (so the
 * rewrite rules skip them too and the BASE route tree comes back), and once
 * the base page is known the client predicts `/funding/grants?state=NSW`
 * from the `/funding/grants` pattern and renders the cached base segments
 * without any request at all ("Optimistic Routing", segment-cache
 * optimistic-routes.js). Result on live: clicking the NSW chip showed the
 * base page — same 53 grants, no NSW title — under the NSW URL.
 *
 * So a link to one of these URLs must be a full document navigation (plain
 * `<a>`, see components/site/rewrite-aware-link.tsx). `needsDocumentNavigation`
 * is that test, and `internalRouteFor` is the one decision the proxy uses
 * too, so links and proxy cannot disagree.
 *
 * Dependency-light on purpose: imported by the proxy and by link components.
 */

import { grantsRewriteTarget } from "@/lib/funding/grants-route";
import { demoBandRewriteTarget } from "@/lib/report-v2/demo-band-route";

/** The internal route that serves this public URL, or null when the URL's own path serves it. */
export function internalRouteFor(pathname: string, search: URLSearchParams): string | null {
  return grantsRewriteTarget(pathname, search) ?? demoBandRewriteTarget(pathname, search);
}

// Only used to resolve relative hrefs; the origin is never compared.
const RESOLVE_BASE = "https://internal-route.invalid";

/**
 * True when a link to `href` must bypass the client router (full page load):
 * the URL is served by another route through the proxy + beforeFiles rewrite,
 * which client-side navigation and prefetch never go through.
 */
export function needsDocumentNavigation(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href, RESOLVE_BASE);
  } catch {
    return false;
  }
  return internalRouteFor(url.pathname, url.searchParams) !== null;
}
