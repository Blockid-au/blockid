// GET /api/domain/comau-check?label=blockid
//        or ?fqdn=blockid.com.au
//
// Guide gap closed: docs/plans/atlassian-standard-mapping-goal.md §1 phase 1
// ("Missing: .com.au availability check"). Spun off as P1a-comau-availability
// — a Chapter-1 P0 trust-signal (60-second win) that mirrors the ABR probe
// at /api/abr/lookup.
//
// Behaviour:
//   * Runs syntactic validation offline (auDA naming-policy subset).
//   * If the label is syntactically valid, does a DNS SOA + NS lookup.
//   * `likely-registered` = at least one SOA or NS record exists.
//   * `likely-available` = both queries return NXDOMAIN / ENODATA — only
//     an auDA-accredited registrar can confirm; the disclaimer says so.
//
// No auth — public dataset (DNS). Rate limiting is at the edge.

import { NextRequest, NextResponse } from "next/server";
import {
  checkComAuRegistration,
  validateComAuLabel,
} from "@/lib/domain/comau-availability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const input = url.searchParams.get("fqdn") ?? url.searchParams.get("label");

  if (!input) {
    return NextResponse.json(
      {
        error: "missing_query_param",
        message: "provide ?label=<slug> or ?fqdn=<slug>.com.au",
      },
      { status: 400 },
    );
  }

  const validation = validateComAuLabel(input);
  if (!validation.valid) {
    return NextResponse.json(
      {
        input,
        label: validation.label,
        valid: false,
        reasons: validation.reasons,
        status: "invalid",
      },
      {
        status: 400,
        headers: { "cache-control": "public, max-age=60" },
      },
    );
  }

  const probe = await checkComAuRegistration(input);
  return NextResponse.json(
    {
      input,
      label: validation.label,
      valid: true,
      ...probe,
    },
    {
      status: 200,
      // DNS delegation flips rarely; 5min edge cache stops the founder
      // hammering resolvers while iterating on labels.
      headers: { "cache-control": "public, max-age=300, s-maxage=300" },
    },
  );
}
