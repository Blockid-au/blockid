// GET /api/verify/valuation/[certificateNo]?hash=<blockid:v1:…>
//
// Public, unauthenticated verification of a valuation certificate (S22-A) —
// the JSON twin of /verify/valuation/[no]. Answers: found?, startup name,
// issue date, stored-hash match, supplied-hash match (when `?hash=` is
// given), revoked state. No valuation figures are ever returned.
//
// Rate-limited per IP so the number space cannot be enumerated quickly;
// an unknown number is a 404 with the same envelope shape.
//
// GET only — nothing mutates, so apiRoute() is not required (S20-A).

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/rate-limit";
import { verifyCertificate } from "@/lib/valuation-certificate/verify";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ certificateNo: string }> }): Promise<Response> {
  const { certificateNo } = await params;
  const limited = enforceRateLimit("verify-valuation", null, req, 60, 60 * 1000);
  if (limited) return limited;

  const hash = new URL(req.url).searchParams.get("hash");
  const answer = await verifyCertificate(getSupabaseAdmin(), certificateNo, hash);
  const headers = { "Cache-Control": "no-store" };
  if (!answer.found) {
    return NextResponse.json({ ok: false, found: false, certificateNo: answer.certificateNo, error: "not_found" }, { status: 404, headers });
  }
  return NextResponse.json({ ok: true, ...answer }, { headers });
}
