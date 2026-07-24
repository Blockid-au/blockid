// GET /api/abr/lookup?abn=79659615111
//
// Guide gap closed: docs/plans/atlassian-standard-mapping-goal.md §1 phase 1
// ("Missing: live ABR ABN-lookup probe"), spun off as P1g. This is a P0
// raise-blocker because founders in Chapter 1 need a 60-second trust signal
// that their entity is real and current before an investor asks the same.
//
// Behaviour:
//   * Always runs the deterministic modulus-89 checksum locally.
//   * If `ABR_GUID` is set, also queries the free ABR AbnDetails web
//     service and merges the live entity_name / status / GST record.
//   * No auth — this is a public lookup wrapper over a public dataset.
//     Rate limiting is handled at the edge (Cloudflare) not here.
//
// The response is safe to inline into a founder-facing surface; the payload
// is factual rather than advisory, so no AFSL disclaimer is required.

import { NextRequest, NextResponse } from "next/server";
import {
  formatAbn,
  lookupAbnLive,
  normalizeAbn,
  validateAbnChecksum,
  type AbnLookupResult,
} from "@/lib/compliance/abn";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawAbn = url.searchParams.get("abn");
  const abn = normalizeAbn(rawAbn);

  if (!abn) {
    return NextResponse.json(
      {
        error: "invalid_abn_format",
        message: "abn query parameter must contain exactly 11 digits",
        input: rawAbn,
      },
      { status: 400 },
    );
  }

  const validChecksum = validateAbnChecksum(abn);
  if (!validChecksum) {
    // Skip the live lookup — ABR would just reject it and we save the round-trip.
    const payload: AbnLookupResult = {
      abn,
      abn_formatted: formatAbn(abn) ?? abn,
      valid_checksum: false,
      source: "checksum",
      live: null,
      live_error: "checksum failed — skipped ABR call",
    };
    return NextResponse.json(payload, {
      status: 200,
      headers: { "cache-control": "public, max-age=60" },
    });
  }

  const { live, live_error } = await lookupAbnLive(abn);
  const payload: AbnLookupResult = {
    abn,
    abn_formatted: formatAbn(abn) ?? abn,
    valid_checksum: true,
    source: live ? "abr-live" : "checksum",
    live,
    live_error,
  };

  return NextResponse.json(payload, {
    status: 200,
    // ABR data changes infrequently; 1h edge cache is safe for a Chapter-1
    // trust-signal use case. Callers doing eligibility gates should bust
    // via the query string if they need fresh reads.
    headers: { "cache-control": "public, max-age=3600, s-maxage=3600" },
  });
}
