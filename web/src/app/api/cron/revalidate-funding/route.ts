// GET|POST /api/cron/revalidate-funding — expire the AU funding catalogue
// data cache (S8-D, 2026-09-11 perf audit).
//
// The directory pages, /funding and POST /api/funding/preview read
// `au_grants` / `au_programs` through a 1 h `unstable_cache` tagged
// `au-funding` (src/lib/funding/data.ts). The two in-process writers (admin
// PATCH, refresh-funding-sources cron) expire it themselves; this route is
// the hook for writers that run OUTSIDE the Next process — today
// `scripts/seed-au-funding.mjs`, which calls it after a live upsert when
// CRON_SECRET + SITE_URL are set. Without it a re-seed is visible only once
// the hour rolls over.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` via isCronAuthorised (the
// S8-E routes table pins the negative cases). No DB, no side effect beyond
// the cache tag — safe to call any number of times.

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { AU_FUNDING_CACHE_TAG, revalidateFundingCatalogue } from "@/lib/funding/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const revalidated = revalidateFundingCatalogue();
  return NextResponse.json({ ok: true, tag: AU_FUNDING_CACHE_TAG, revalidated });
}

// The seed script POSTs; GET is kept for a manual curl check.
export { GET as POST };
