/**
 * /funding/grants — the base (unfiltered) grants directory. Static + ISR
 * (S31-D): no `searchParams` here — the proxy rewrites `?state=NSW` onto
 * `./state/[state]` and every other filter combination onto `./view`
 * (lib/funding/grants-route.ts), so this document is the same for every
 * visitor and the edge can cache it. Renderer + metadata live in
 * ./grants-directory.tsx.
 */

import type { Metadata } from "next";
import { EMPTY_GRANT_FILTERS, GrantsDirectory, grantsMetadata } from "./grants-directory";

// Route segment config must be a literal (Next evaluates it statically).
export const revalidate = 3600;

export const metadata: Metadata = grantsMetadata(EMPTY_GRANT_FILTERS);

export default function GrantsDirectoryPage() {
  return <GrantsDirectory filters={EMPTY_GRANT_FILTERS} />;
}
