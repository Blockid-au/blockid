/**
 * `/funding/grants?state=NSW` — the per-state "<state> startup grants"
 * landing page (S8-A), served through this static route (S31-D). The
 * public URL keeps the query-string shape: the proxy rewrites it here
 * (lib/funding/grants-route.ts), the metadata self-canonicalises to
 * `/funding/grants?state=NSW`, and the sitemap keeps listing that URL. One
 * document per AU state + national, prerendered at build, ISR 1 h.
 *
 * Direct hits on `/funding/grants/state/NSW` work too and canonicalise to
 * the query URL, so they never compete with it in the index. Any other slug
 * is a 404 (`notFound()` — the only 404 path on this route).
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { grantsStateParams } from "@/lib/funding/grants-route";
import { AU_STATES } from "@/lib/funding/seed-map";
import { EMPTY_GRANT_FILTERS, GrantsDirectory, grantsMetadata } from "../../grants-directory";

export const revalidate = 3600;
// L0-5 (2026-10-20): NO `dynamicParams = false` here. With it, Next 16.3.5
// marks the route `fallback: false`, and any request that finds no usable
// cache entry for a prerendered state throws NoFallbackError → 404 instead of
// regenerating. That is exactly what `revalidateTag("au-funding", { expire: 0 })`
// (weekly refresh-funding-sources cron, admin PATCH) causes: the tag-expired
// entry reads as null, and every state page answered 404 (`x-nextjs-cache:
// HIT` = the cached /_not-found) from 2026-10-04 04:00 UTC until a restart,
// while the good HTML sat untouched on disk. With the default (blocking
// fallback) an expired entry is simply re-rendered. Unknown slugs still 404
// via `notFound()` below, and a catalogue outage throws (strict read) so ISR
// keeps the last good page instead of caching an empty one.

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
  return <GrantsDirectory filters={{ ...EMPTY_GRANT_FILTERS, state }} throwOnUnavailable />;
}
