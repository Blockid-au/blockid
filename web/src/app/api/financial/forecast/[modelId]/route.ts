/**
 * GET/PUT/DELETE /api/financial/forecast/[modelId]
 *
 * GET: List all financial models for a project (pass projectId as modelId)
 * PUT: Update a model's metadata (name, investor pack flag)
 * DELETE: Soft-delete a model
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import type {
  ListForecastsResponse,
  UpdateForecastResponse,
} from "@/types/financial";
import { apiRoute } from "@/lib/audit/api-route";
import { assertProjectAccess } from "@/lib/projects";
import { projectAccessResponse } from "@/lib/project-members/http";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ modelId: string }>;
}

// ─── GET — list models for a project ─────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const { modelId: projectId } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 });
  }

  // Release QA-4 P2-e: the previous check selected `projects.created_by`, a column
  // that does not exist, so every call was denied (fail-closed, feature dead).
  // Access now goes through the S17-A chokepoint `assertProjectAccess`
  // (owner or accepted member ≥ minRole; 404 for a non-member so the project's
  // existence is not confirmed, 403 for an under-ranked member, 503 no DB).
  try {
    await assertProjectAccess(user.id, projectId, "viewer");
  } catch (err) {
    const denied = projectAccessResponse(err);
    if (denied) return denied;
    throw err;
  }

  const { data: models, error: modelsError } = await supabase
    .from("financial_models")
    .select(
      "id, project_id, user_id, name, model_type, description, current_arr_aud, monthly_growth_pct, churn_pct, cogs_pct, opex_monthly_aud, fixed_costs_aud, include_tax_incentives, scenario, month_breakeven, months_to_series_a, peak_monthly_burn_aud, arr_month_12_aud, arr_month_24_aud, arr_month_36_aud, runway_months, is_deleted, use_for_investor_pack, published_at, version, created_at, updated_at",
    )
    .eq("project_id", projectId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  if (modelsError) {
    console.error("[GET /api/financial/forecast/[modelId]] Error:", modelsError);
    return NextResponse.json({ ok: false, error: "Failed to fetch models" }, { status: 500 });
  }

  const response: ListForecastsResponse = { ok: true, models: models ?? [] };
  return NextResponse.json(response);
}

// ─── PUT — update model metadata ─────────────────────────────────────────────

async function PUT_handler(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const { modelId: projectId } = await params;

  let body: { modelId?: string; name?: string; useForInvestorPack?: boolean; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { modelId, name, useForInvestorPack, notes } = body;
  if (!modelId) {
    return NextResponse.json({ ok: false, error: "modelId required in body" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 });
  }

  const { data: model, error: modelError } = await supabase
    .from("financial_models")
    .select("id, project_id, user_id")
    .eq("id", modelId)
    .eq("project_id", projectId)
    .single();

  if (modelError || !model || model.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Model not found or unauthorized" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name) updateData.name = name;
  if (useForInvestorPack !== undefined) updateData.use_for_investor_pack = useForInvestorPack;
  if (notes) updateData.description = notes;

  const { data: updatedModel, error: updateError } = await supabase
    .from("financial_models")
    .update(updateData)
    .eq("id", modelId)
    .select()
    .single();

  if (updateError) {
    console.error("[PUT /api/financial/forecast/[modelId]] Error:", updateError);
    return NextResponse.json({ ok: false, error: "Failed to update model" }, { status: 500 });
  }

  const response: UpdateForecastResponse = { ok: true, model: updatedModel };
  return NextResponse.json(response);
}

// ─── DELETE — soft-delete model ───────────────────────────────────────────────

async function DELETE_handler(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const { modelId: projectId } = await params;
  const targetModelId = request.nextUrl.searchParams.get("modelId");

  if (!targetModelId) {
    return NextResponse.json({ ok: false, error: "modelId query parameter required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 });
  }

  const { data: model, error: modelError } = await supabase
    .from("financial_models")
    .select("id, project_id, user_id")
    .eq("id", targetModelId)
    .eq("project_id", projectId)
    .single();

  if (modelError || !model || model.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Model not found or unauthorized" }, { status: 404 });
  }

  const { error: deleteError } = await supabase
    .from("financial_models")
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq("id", targetModelId);

  if (deleteError) {
    console.error("[DELETE /api/financial/forecast/[modelId]] Error:", deleteError);
    return NextResponse.json({ ok: false, error: "Failed to delete model" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const PUT = apiRoute({ route: "api/financial/forecast/[modelId]/route.ts", method: "PUT" }, PUT_handler);
export const DELETE = apiRoute({ route: "api/financial/forecast/[modelId]/route.ts", method: "DELETE" }, DELETE_handler);
