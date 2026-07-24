// POST /api/compliance/esic — assess ESIC eligibility and persist the
// result under the authenticated user's active project.
// GET  /api/compliance/esic — return the most-recent assessment (or null).
//
// Contract: web/src/lib/compliance/esic-eligibility.ts.
// Legal ref: Division 360 ITAA97. Not tax advice — every response
// includes the ESIC_DISCLAIMER string.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveProject } from "@/lib/projects";
import {
  assessESIC,
  ESIC_DISCLAIMER,
  type ESICInput,
} from "@/lib/compliance/esic-eligibility";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated", disclaimer: ESIC_DISCLAIMER },
      { status: 401 },
    );
  }

  let body: ESICInput;
  try {
    body = (await request.json()) as ESICInput;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", disclaimer: ESIC_DISCLAIMER },
      { status: 400 },
    );
  }

  if (
    typeof body?.company_incorporated_year !== "number" ||
    typeof body?.turnover_prior_year_aud !== "number" ||
    typeof body?.total_expenses_prior_year_aud !== "number" ||
    typeof body?.is_listed !== "boolean"
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_required_fields",
        required: [
          "company_incorporated_year",
          "turnover_prior_year_aud",
          "total_expenses_prior_year_aud",
          "is_listed",
        ],
        disclaimer: ESIC_DISCLAIMER,
      },
      { status: 400 },
    );
  }

  const result = assessESIC(body);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const project = await getActiveProject(user.id);
    await supabase.from("compliance_esic_assessments").insert({
      user_id: user.id,
      project_id: project?.id ?? null,
      input_json: body,
      result_json: result,
      is_esic: result.is_esic,
      points_100: result.eligible_innovation_100pt,
    });
  }

  return NextResponse.json({ ok: true, result });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated", disclaimer: ESIC_DISCLAIMER },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({
      ok: true,
      result: null,
      meta: { source: "no_db" },
      disclaimer: ESIC_DISCLAIMER,
    });
  }

  const project = await getActiveProject(user.id);
  const { data } = await supabase
    .from("compliance_esic_assessments")
    .select("input_json, result_json, is_esic, points_100, assessed_at")
    .eq("user_id", user.id)
    .eq("project_id", project?.id ?? null)
    .order("assessed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    result: data ?? null,
    disclaimer: ESIC_DISCLAIMER,
  });
}
