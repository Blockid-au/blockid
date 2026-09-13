// GET /api/secondary/sim/book (S27-B) — secondary trading SANDBOX book view.
//
// SANDBOX: no real securities are offered or transferred; nothing here is an
// offer under Chapter 6D / Chapter 7 of the Corporations Act 2001 (Cth).
// The response carries `sandbox: true` and the notice.
//
// viewer+ on the project. Returns the depth ladder (bids / asks, held qty
// flagged), the trades tape, sandbox positions per holder and the pure
// `priceDiscovery()` output — mid, VWAP, last, and the "sandbox implied"
// valuation = last × fully diluted shares from the OWNER's cap table.
// Growth+ gate is on the page + the order routes; the read is viewer+ so a
// member can watch the sandbox their project owner unlocked.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { buildBookView } from "@/lib/secondary/sim";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "project_required" }, { status: 404 });

  const view = await buildBookView(supabase, { projectId: scope.projectId, ownerUserId: scope.ownerUserId });
  return NextResponse.json({ ok: true, role: scope.role, ...view });
}
