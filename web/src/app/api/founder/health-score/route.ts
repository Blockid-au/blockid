// GET /api/founder/health-score?startup_id=<uuid>
//
// Returns the composite Startup Health Score for a founder's startup.
// The score aggregates SVI, Tech, profile completeness, and analysis
// completeness into a single 0-100 number with grade (A-F) and top 3
// recommended actions.
//
// Auth:    getCurrentUser() — scoped to user's own startups
// Cache:   Next.js route segment revalidate: 3600 (1 hour)
// Params:  startup_id (query string, required)

import "server-only";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { computeHealthScore } from "@/lib/health-score";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "authentication_required" },
      { status: 401 },
    );
  }

  // ── Param ─────────────────────────────────────────────────────────────────
  const startupId = request.nextUrl.searchParams.get("startup_id");
  if (!startupId || typeof startupId !== "string" || startupId.trim().length === 0) {
    return NextResponse.json(
      { ok: false, reason: "startup_id_required" },
      { status: 400 },
    );
  }

  // ── Ownership check ───────────────────────────────────────────────────────
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, reason: "service_unavailable" },
      { status: 503 },
    );
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", startupId)
    .eq("user_id", user.id)
    .is("archived_at", null)
    .maybeSingle();

  if (projectError || !project) {
    return NextResponse.json(
      { ok: false, reason: "startup_not_found" },
      { status: 404 },
    );
  }

  // ── Compute ───────────────────────────────────────────────────────────────
  try {
    const result = await computeHealthScore(startupId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[blockid:health-score] computeHealthScore failed", err);
    return NextResponse.json(
      { ok: false, reason: "computation_failed" },
      { status: 500 },
    );
  }
}
