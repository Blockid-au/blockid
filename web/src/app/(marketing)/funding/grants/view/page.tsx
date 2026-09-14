/**
 * `/funding/grants?type=…&stage=…&status=…` (any chip combination other
 * than a lone valid `state`) — the filtered view of the directory. Reads
 * `searchParams`, so it is a per-request render (nonce CSP, private); the
 * proxy rewrites those URLs here (lib/funding/grants-route.ts) and the
 * metadata canonicalises to the base page exactly as before (S8-A). The
 * public URL never shows `/view`.
 */

import type { Metadata } from "next";
import { parseGrantFilters, type SearchParamsLike } from "@/lib/funding/directory";
import { GrantsDirectory, grantsMetadata } from "../grants-directory";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParamsLike> }): Promise<Metadata> {
  // Chip permutations were already "canonical → base page" (S8-A: the
  // index must never fill with them); `noindex, follow` says the same thing
  // without leaving Google to reconcile a self-referencing duplicate title.
  return { ...grantsMetadata(parseGrantFilters(await searchParams)), robots: { index: false, follow: true } };
}

export default async function GrantsFilteredViewPage({ searchParams }: { searchParams: Promise<SearchParamsLike> }) {
  return <GrantsDirectory filters={parseGrantFilters(await searchParams)} />;
}
