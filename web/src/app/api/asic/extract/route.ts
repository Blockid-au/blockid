// GET /api/asic/extract?acn=659615111
//
// Guide gap closed: docs/plans/atlassian-standard-mapping-goal.md §2 Folder 1
// item 1.2 ("Company Extract (ASIC) — auto-probe via ASIC Connect API,
// currently no /api/asic/extract"), spun off as P1h. Sibling ticket P1g
// shipped the ABN-side probe; this closes the ACN-side parity so a founder
// in Chapter 1 can validate the incorporating company number in ≤ 60s.
//
// Behaviour:
//   * Always runs the deterministic modulus-10 checksum locally.
//   * If `ABR_GUID` is set, also queries the free ABR AcnDetails web service
//     (a free ABR-side view of an ASIC-registered company) and merges the
//     live entity_name / ABN / status / GST record.
//   * The paid ASIC Company Extract (charges, historical officers) is not
//     covered; that would require a separate ASIC Connect API key.
//   * No auth — this is a public lookup wrapper over a public dataset. Rate
//     limiting is handled at the edge (Cloudflare) not here.
//
// The response is safe to inline into a founder-facing surface; the payload
// is factual rather than advisory, so no AFSL disclaimer is required.

import { NextRequest, NextResponse } from "next/server";
import {
  formatAcn,
  lookupAcnLive,
  normalizeAcn,
  validateAcnChecksum,
  type AcnLookupResult,
} from "@/lib/compliance/acn";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawAcn = url.searchParams.get("acn");
  const acn = normalizeAcn(rawAcn);

  if (!acn) {
    return NextResponse.json(
      {
        error: "invalid_acn_format",
        message: "acn query parameter must contain exactly 9 digits",
        input: rawAcn,
      },
      { status: 400 },
    );
  }

  const validChecksum = validateAcnChecksum(acn);
  if (!validChecksum) {
    // Skip the live lookup — ABR would just reject it and we save the round-trip.
    const payload: AcnLookupResult = {
      acn,
      acn_formatted: formatAcn(acn) ?? acn,
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

  const { live, live_error } = await lookupAcnLive(acn);
  const payload: AcnLookupResult = {
    acn,
    acn_formatted: formatAcn(acn) ?? acn,
    valid_checksum: true,
    source: live ? "abr-live" : "checksum",
    live,
    live_error,
  };

  return NextResponse.json(payload, {
    status: 200,
    // ASIC company records change infrequently; 1h edge cache is safe for a
    // Chapter-1 trust-signal use case. Callers doing eligibility gates should
    // bust via the query string if they need fresh reads.
    headers: { "cache-control": "public, max-age=3600, s-maxage=3600" },
  });
}
