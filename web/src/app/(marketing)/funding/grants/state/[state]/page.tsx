/**
 * `/funding/grants?state=NSW` — the per-state "<state> startup grants"
 * landing page (S8-A), served through this static route (S31-D). The
 * public URL keeps the query-string shape: the proxy rewrites it here
 * (lib/funding/grants-route.ts), the metadata self-canonicalises to
 * `/funding/grants?state=NSW`, and the sitemap keeps listing that URL. One
 * document per AU state + national, prerendered at build, ISR 1 h.
 *
 * Direct hits on `/funding/grants/state/NSW` work too and canonicalise to
 * the query URL, so they never compete with it in the index.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { grantsStateParams } from "@/lib/funding/grants-route";
import { AU_STATES } from "@/lib/funding/seed-map";
import { EMPTY_GRANT_FILTERS, GrantsDirectory, grantsMetadata } from "../../grants-directory";

export const revalidate = 3600;
// Only the states from generateStaticParams exist; anything else is a 404,
// never an on-demand render of a junk state.
export const dynamicParams = false;

export function generateStaticParams(): Array<{ state: string }> {
  return grantsStateParams();
}

type Params = Promise<{ state: string }>;

function stateOf(raw: string): string | null {
  return (AU_STATES as readonly string[]).includes(raw) ? raw : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const state = stateOf((await params).state);
  return grantsMetadata({ ...EMPTY_GRANT_FILTERS, state });
}

export default async function GrantsStatePage({ params }: { params: Params }) {
  const state = stateOf((await params).state);
  if (!state) notFound();
  return <GrantsDirectory filters={{ ...EMPTY_GRANT_FILTERS, state }} />;
}
