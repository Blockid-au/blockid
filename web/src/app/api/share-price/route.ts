// GET /api/share-price — price per share for the active project (S26-B).
//
// The assembly (SVI + connected ARR + fully diluted shares →
// `computeSharePrice`) lives in lib/share-price-server.ts since S28-A so the
// dividend issue flow prices DRIP allotments off the same blend; this route
// is the HTTP face: auth → scope (viewer+) → db → lib.
//
//   200 { ok, sharePrice: SharePriceResult, inputs: { svi, stage, sector, arrAud, source, issuedShares, esopPoolShares } }
//   401 / 403 / 404 scope   503 no db
//
// GET only — nothing mutates.

import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { loadSharePriceForScope, mapStage } from "@/lib/share-price-server";

export const dynamic = "force-dynamic";

export { mapStage };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "project_required" }, { status: 404 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const { sharePrice, inputs } = await loadSharePriceForScope(supabase, scope, { email: user.email });
  return NextResponse.json({ ok: true, sharePrice, inputs }, { headers: { "Cache-Control": "private, no-store" } });
}
