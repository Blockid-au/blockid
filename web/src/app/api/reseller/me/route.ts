// GET /api/reseller/me — return the current user's attributed reseller
// display metadata for co-branding surfaces (topbar pill, welcome pane,
// email footer).
//
// Per docs/plans/reseller-module-plan.md § P5 co-branding — the
// useResellerAttribution() client hook polls this endpoint.
//
// Response shape:
//   { ok: true, reseller: {code, display_name, logo_url, primary_color,
//                          billing_model} }
//   { ok: true, reseller: null }        — signed-in but no attribution
//   { ok: false, reason: "unauthenticated" }  — anonymous
//
// Attribution source: app_users.attribution_reseller_id (cache column
// populated by processAttribution() at signup). Falls back gracefully
// when the column or resellers table is missing (pre-P1.4-apply state).
//
// r-01-exempt: reads only the current session user's own attribution_reseller_id + the referenced reseller's public display fields; the viewer is not a reseller admin, so scopedReseller() would reject them by design.

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "unauthenticated" as const },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: true as const, reseller: null });
  }

  try {
    const { data: userRow } = await supabase
      .from("app_users")
      .select("attribution_reseller_id")
      .eq("id", user.id)
      .maybeSingle();

    const resellerId =
      (userRow as { attribution_reseller_id?: string | null } | null)
        ?.attribution_reseller_id ?? null;

    if (!resellerId) {
      return NextResponse.json({ ok: true as const, reseller: null });
    }

    const { data: reseller } = await supabase
      .from("resellers")
      .select("code, display_name, logo_url, primary_color, billing_model, status")
      .eq("id", resellerId)
      .maybeSingle();

    if (!reseller || reseller.status !== "active") {
      return NextResponse.json({ ok: true as const, reseller: null });
    }

    return NextResponse.json({
      ok: true as const,
      reseller: {
        code: reseller.code,
        display_name: reseller.display_name,
        logo_url: reseller.logo_url,
        primary_color: reseller.primary_color,
        billing_model: reseller.billing_model,
      },
    });
  } catch {
    // Pre-migration DB (0091/0092 not yet applied) or transient failure.
    // Fail closed on the pill (no reseller) — never surface a partial state.
    return NextResponse.json({ ok: true as const, reseller: null });
  }
}
