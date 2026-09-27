import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { findSVIAccountWithFallback } from "@/lib/projects";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { apiRoute } from "@/lib/audit/api-route";
import { valuationNotEstimable } from "@/lib/valuation/not-estimable";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// /api/valuation — V04a (founder decision D22, 2026-09-27).
//
// This route used to price the company with `computeValuation`: a Berkus +
// Scorecard blend whose pillars were the SVI dimension scores (and the SVI
// total as a fallback), cross-checked against connected MRR. D22: the SVI is
// an uncapped index, not a dollar valuation — a figure may only come from a
// CFO valuation method with qualified inputs (the report pipeline's
// `cfo-valuation.ts`, `/api/valuation/vc`, `/api/valuation/scenario`). Both
// verbs now answer "not estimable" with the evidence that unlocks a method.
// POST no longer charges credits: nothing is computed.
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Authentication required" },
        { status: 401 },
      );
    }
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: "Service unavailable" },
        { status: 503 },
      );
    }

    // S18-A — member-aware read (viewer+): the OWNER's record on a shared project.
    const { scope, denied } = await projectScopeOrDeny("viewer");
    if (denied) return denied;
    const account = await findSVIAccountWithFallback(
      scope?.dataEmail ?? user.email,
      scope?.projectId ?? null,
      "id, current_svi, current_stage",
      { callerEmail: user.email },
    );
    if (!account) {
      return NextResponse.json(
        { ok: false, error: "No SVI account found. Complete an SVI analysis first." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      valuation: valuationNotEstimable(),
      sviScore: (account.current_svi as number | null) ?? null,
      numericStage: (account.current_stage as number | null) ?? null,
    });
  } catch (err) {
    console.error("[blockid:valuation] GET error", err);
    return NextResponse.json(
      { ok: false, error: "Valuation lookup failed" },
      { status: 500 },
    );
  }
}

async function POST_handler() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }
  // No SVI-driven scenario is computed and no credit is spent.
  return NextResponse.json({ ok: true, valuation: valuationNotEstimable(), charged: false });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/valuation/route.ts", method: "POST" }, POST_handler);
