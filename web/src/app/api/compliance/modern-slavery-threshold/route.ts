// POST /api/compliance/modern-slavery-threshold — assess the Modern Slavery
// Act 2018 (Cth) s5 A$100M consolidated-revenue threshold and persist the
// latest snapshot per (user_id, project_id).
// GET returns the latest saved snapshot.
//
// Legal ref: Attorney-General's Department — Modern Slavery Act guidance
// https://www.ag.gov.au/rights-and-protections/publications/modern-slavery-act-2018-guidance-reporting-entities
//
// Every response carries MODERN_SLAVERY_DISCLAIMER — not legal advice.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveProject } from "@/lib/projects";
import {
  assessModernSlavery,
  MODERN_SLAVERY_DISCLAIMER,
  type ModernSlaveryInput,
} from "@/lib/compliance/modern-slavery-threshold";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      {
        ok: false,
        error: "unauthenticated",
        disclaimer: MODERN_SLAVERY_DISCLAIMER,
      },
      { status: 401 },
    );
  }

  let body: ModernSlaveryInput;
  try {
    body = (await request.json()) as ModernSlaveryInput;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_json",
        disclaimer: MODERN_SLAVERY_DISCLAIMER,
      },
      { status: 400 },
    );
  }

  if (typeof body?.current_period_revenue_aud !== "number") {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_required_fields",
        required: ["current_period_revenue_aud"],
        disclaimer: MODERN_SLAVERY_DISCLAIMER,
      },
      { status: 400 },
    );
  }

  const result = assessModernSlavery(body);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const project = await getActiveProject(user.id);
    await supabase.from("compliance_modern_slavery_status").insert({
      user_id: user.id,
      project_id: project?.id ?? null,
      input_json: body,
      result_json: result,
      is_reporting_entity: result.is_reporting_entity,
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
      {
        ok: false,
        error: "unauthenticated",
        disclaimer: MODERN_SLAVERY_DISCLAIMER,
      },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({
      ok: true,
      result: null,
      disclaimer: MODERN_SLAVERY_DISCLAIMER,
    });
  }

  const project = await getActiveProject(user.id);
  const { data } = await supabase
    .from("compliance_modern_slavery_status")
    .select(
      "input_json, result_json, is_reporting_entity, is_above_threshold, action_required, urgency, computed_at",
    )
    .eq("user_id", user.id)
    .eq("project_id", project?.id ?? null)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    result: data ?? null,
    disclaimer: MODERN_SLAVERY_DISCLAIMER,
  });
}
