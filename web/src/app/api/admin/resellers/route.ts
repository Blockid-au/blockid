// GET  /api/admin/resellers      — list all resellers
// POST /api/admin/resellers      — create a new reseller org
//
// Per docs/plans/reseller-module-plan.md § C.5 admin approval flows.
// Mirror of /api/admin/accelerator/route.ts. requireAdmin gate.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin, AdminGateError } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normaliseResellerCode } from "@/lib/reseller/attribution";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  try {
    requireAdmin(user);
  } catch (err) {
    if (err instanceof AdminGateError) {
      return NextResponse.json({ ok: false, reason: err.code }, { status: 401 });
    }
    throw err;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  try {
    const { data, error } = await supabase
      .from("resellers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ ok: true, resellers: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "query_failed", error: (err as Error).message },
      { status: 500 },
    );
  }
}

interface CreateBody {
  code?: string;
  display_name?: string;
  billing_model?: "retail" | "wholesale";
  gst_registered?: boolean;
  abn?: string;
  monthly_credit_budget?: number;
  monthly_sandbox_credits?: number;
  allowed_tiers?: number[];
  can_create_startups?: boolean;
  can_grant_credits?: boolean;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  try {
    requireAdmin(user);
  } catch (err) {
    if (err instanceof AdminGateError) {
      return NextResponse.json({ ok: false, reason: err.code }, { status: 401 });
    }
    throw err;
  }

  let body: CreateBody = {};
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  const code = normaliseResellerCode(body.code);
  if (!code) {
    return NextResponse.json({ ok: false, reason: "code_required" }, { status: 400 });
  }
  if (!body.display_name) {
    return NextResponse.json({ ok: false, reason: "display_name_required" }, { status: 400 });
  }

  // Wholesale enforces GST + ABN per § U.15.1 D2-CFO-01 + D4-CLO-03.
  const billingModel = body.billing_model ?? "retail";
  if (billingModel === "wholesale") {
    if (!body.gst_registered) {
      return NextResponse.json(
        { ok: false, reason: "wholesale_requires_gst" },
        { status: 400 },
      );
    }
    if (!body.abn || !/^\d{2} \d{3} \d{3} \d{3}$/.test(body.abn)) {
      return NextResponse.json(
        { ok: false, reason: "wholesale_requires_abn", hint: "format: NN NNN NNN NNN" },
        { status: 400 },
      );
    }
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  try {
    const { data, error } = await supabase
      .from("resellers")
      .insert({
        code,
        display_name: body.display_name,
        billing_model: billingModel,
        gst_registered: body.gst_registered ?? false,
        abn: body.abn ?? null,
        monthly_credit_budget: body.monthly_credit_budget ?? 0,
        monthly_sandbox_credits: body.monthly_sandbox_credits ?? 500,
        allowed_tiers: body.allowed_tiers ?? [0, 10, 20, 30, 40],
        can_create_startups: body.can_create_startups ?? false,
        can_grant_credits: body.can_grant_credits ?? false,
        status: "active",
      })
      .select()
      .single();

    if (error) {
      if (error.message?.includes("resellers_code_key")) {
        return NextResponse.json(
          { ok: false, reason: "code_taken" },
          { status: 409 },
        );
      }
      throw error;
    }

    return NextResponse.json({ ok: true, reseller: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "insert_failed", error: (err as Error).message },
      { status: 500 },
    );
  }
}
