// POST /api/compliance/wgea-threshold — assess the WGE Act 2012 (Cth) s3
// 100-employee threshold from the founder's Australian headcount + history
// and persist the latest snapshot per (user_id, project_id).
// GET returns the latest saved snapshot.
//
// Legal ref: WGEA — Who has to report
// https://www.wgea.gov.au/what-we-do/reporting
//
// Every response carries WGEA_DISCLAIMER — not legal or HR advice.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveProject } from "@/lib/projects";
import {
  assessWGEA,
  WGEA_DISCLAIMER,
  type WGEAInput,
} from "@/lib/compliance/wgea-threshold";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated", disclaimer: WGEA_DISCLAIMER },
      { status: 401 },
    );
  }

  let body: WGEAInput;
  try {
    body = (await request.json()) as WGEAInput;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", disclaimer: WGEA_DISCLAIMER },
      { status: 400 },
    );
  }

  if (
    typeof body?.current_headcount_au !== "number" ||
    typeof body?.has_previously_reported !== "boolean"
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_required_fields",
        required: ["current_headcount_au", "has_previously_reported"],
        disclaimer: WGEA_DISCLAIMER,
      },
      { status: 400 },
    );
  }

  const result = assessWGEA(body);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const project = await getActiveProject(user.id);
    await supabase.from("compliance_wgea_status").insert({
      user_id: user.id,
      project_id: project?.id ?? null,
      input_json: body,
      result_json: result,
      is_relevant_employer: result.is_relevant_employer,
      is_above_threshold: result.is_above_threshold,
      action_required: result.action_required,
      urgency: result.urgency,
    });
  }

  return NextResponse.json({ ok: true, result });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated", disclaimer: WGEA_DISCLAIMER },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({
      ok: true,
      result: null,
      disclaimer: WGEA_DISCLAIMER,
    });
  }

  const project = await getActiveProject(user.id);
  const { data } = await supabase
    .from("compliance_wgea_status")
    .select(
      "input_json, result_json, is_relevant_employer, is_above_threshold, action_required, urgency, computed_at",
    )
    .eq("user_id", user.id)
    .eq("project_id", project?.id ?? null)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    result: data ?? null,
    disclaimer: WGEA_DISCLAIMER,
  });
}
