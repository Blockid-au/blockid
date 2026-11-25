/**
 * RewriteAwareLink — `next/link` for every URL except the query URLs the
 * proxy serves from another route (`/funding/grants?state=NSW`, chip
 * combinations, `/tbr/demo?band=A`): those get a plain `<a>` so the browser
 * does a full page load (G36 tick 3).
 *
 * Why: client-side navigation never reaches the proxy's internal-route
 * decision — prefetches skip the proxy, and the router predicts the URL
 * from the base page's route pattern and renders its cached segments — so a
 * `<Link>` showed the base page's content under the filtered URL. A document
 * load goes through proxy → beforeFiles rewrite → the right route, with that
 * route's CSP (hash for the static state / band pages, nonce for the dynamic
 * view) and Cache-Control. See lib/routing/internal-route.ts.
 *
 * Use it wherever an href can be one of those URLs (directory chips, state
 * links, band switcher). Server- and client-safe: no hooks, no state.
 */

import Link from "next/link";
import type { AnchorHTMLAttributes } from "react";
import { needsDocumentNavigation } from "@/lib/routing/internal-route";

export type RewriteAwareLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export function RewriteAwareLink({ href, ...rest }: RewriteAwareLinkProps) {
  // Attribute order matches next/link (props, then href) so the markup is unchanged.
  if (needsDocumentNavigation(href)) return <a {...rest} href={href} />;
  return <Link href={href} {...rest} />;
}

export default RewriteAwareLink;
