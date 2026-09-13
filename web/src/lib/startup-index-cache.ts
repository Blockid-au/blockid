// Data-cache wrappers for the public Startup Index surfaces.
//
// S31-C capacity audit (2026-09-13). The startup-index pages and the
// /api/index/* routes declare `revalidate = 300`, but every route under the
// root layout renders per request (the layout reads `headers()` for the CSP
// nonce), so that setting never produced a cached page. Each public view
// therefore re-ran the aggregator's `svi_analyses` read — pg_stat_statements
// has it at 45,046 calls / 51 ms mean / 2,316 s total since 2026-08-01, the
// single largest query by total time on the box — and the row count only
// grows with a trial wave.
//
// This is the same pattern `lib/funding/data.ts` uses: `unstable_cache`
// (data cache, 5 min, tag `STARTUP_INDEX_CACHE_TAG`) around the pure
// aggregators, with a direct-read fallback outside the Next runtime
// (vitest, scripts) where `unstable_cache` throws its "incrementalCache
// missing" invariant. The cron digests keep calling the uncached compute
// functions — they run once and want fresh rows. The per-ticker detail page
// already has its own 10-minute wrapper (startup-index/listings/[ticker]).
//
// Colocated tests: startup-index-cache.test.ts.

import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { computeIndexHeadlines, type IndexHeadlines } from "@/lib/startup-index-aggregator";
import { computeListings, type ListingsResult } from "@/lib/startup-index-listings";

/** Data-cache tag every public index read carries; writers may revalidate it. */
export const STARTUP_INDEX_CACHE_TAG = "startup-index";
/** Matches the `revalidate = 300` the index pages and /api/index/* declare. */
export const STARTUP_INDEX_CACHE_SECONDS = 300;

type ListingsArgs = Parameters<typeof computeListings>[0];

function isOutsideNextRuntime(err: unknown): boolean {
  return err instanceof Error && /incrementalCache missing/.test(err.message);
}

/**
 * Wrap a keyed reader in the data cache. The key is a plain string so the
 * cache dedupes on value, not object identity. Outside the Next runtime the
 * reader is called directly; any other error propagates (the callers
 * already handle aggregator failures).
 */
function cached<T>(scope: string, reader: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const viaDataCache = unstable_cache(reader, [`startup-index:${scope}`], {
    tags: [STARTUP_INDEX_CACHE_TAG],
    revalidate: STARTUP_INDEX_CACHE_SECONDS,
  });
  return async (key: string): Promise<T> => {
    try {
      return await viaDataCache(key);
    } catch (err) {
      if (isOutsideNextRuntime(err)) return reader(key);
      throw err;
    }
  };
}

const headlinesReader = cached<IndexHeadlines>("headlines", (key) => computeIndexHeadlines(Number(key)));
const listingsReader = cached<ListingsResult>("listings", (key) => computeListings(JSON.parse(key) as ListingsArgs));

/** `computeIndexHeadlines`, cached 5 min per window. */
export function cachedIndexHeadlines(windowDays = 90): Promise<IndexHeadlines> {
  return headlinesReader(String(windowDays));
}

/** Stable key for a listings query — sorted keys so `{a,b}` and `{b,a}` share an entry. */
export function listingsCacheKey(args: ListingsArgs): string {
  const filter = args.filter ?? {};
  const sortedFilter = Object.fromEntries(
    Object.entries(filter)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return JSON.stringify({
    filter: sortedFilter,
    sort: args.sort ?? "svi",
    order: args.order ?? "desc",
    page: Math.max(1, args.page ?? 1),
    pageSize: Math.min(100, Math.max(10, args.pageSize ?? 50)),
  });
}

/** `computeListings`, cached 5 min per (filter, sort, order, page, pageSize). */
export function cachedListings(args: ListingsArgs): Promise<ListingsResult> {
  return listingsReader(listingsCacheKey(args));
}

/** Drop every cached index read (call after a bulk re-score or backfill). */
export function revalidateStartupIndex(): void {
  revalidateTag(STARTUP_INDEX_CACHE_TAG, { expire: 0 });
}
