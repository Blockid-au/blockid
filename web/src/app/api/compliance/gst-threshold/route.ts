// POST /api/compliance/gst-threshold — assess the A$75k GST registration
// threshold from the founder's monthly revenue history + projections and
// persist the latest snapshot per (user_id, project_id).
// GET returns the latest saved snapshot.
//
// Legal ref: ATO — Registering for GST
// https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/registering-for-gst
//
// Every response carries GST_DISCLAIMER — not tax advice.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveProject } from "@/lib/projects";
import {
  assessGST,
  GST_DISCLAIMER,
  type GSTInput,
} from "@/lib/compliance/gst-threshold";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated", disclaimer: GST_DISCLAIMER },
      { status: 401 },
    );
  }

  let body: GSTInput;
  try {
    body = (await request.json()) as GSTInput;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", disclaimer: GST_DISCLAIMER },
      { status: 400 },
    );
  }

  if (
    !Array.isArray(body?.monthly_turnover_last_12_months) ||
    typeof body?.registered_for_gst !== "boolean"
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_required_fields",
        required: ["monthly_turnover_last_12_months", "registered_for_gst"],
        disclaimer: GST_DISCLAIMER,
      },
      { status: 400 },
    );
  }

  const result = assessGST(body);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const project = await getActiveProject(user.id);
    await supabase.from("compliance_gst_status").insert({
      user_id: user.id,
      project_id: project?.id ?? null,
      input_json: body,
      result_json: result,
      is_above_threshold: result.is_above_threshold,
      registered_for_gst: body.registered_for_gst,
      urgency: result.urgency,
    });
  }

  return NextResponse.json({ ok: true, result });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated", disclaimer: GST_DISCLAIMER },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({
      ok: true,
      result: null,
      disclaimer: GST_DISCLAIMER,
    });
  }

  const project = await getActiveProject(user.id);
  const { data } = await supabase
    .from("compliance_gst_status")
    .select(
      "input_json, result_json, is_above_threshold, registered_for_gst, urgency, computed_at",
    )
    .eq("user_id", user.id)
    .eq("project_id", project?.id ?? null)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    result: data ?? null,
    disclaimer: GST_DISCLAIMER,
  });
}
