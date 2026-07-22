// GET    /api/admin/resellers/[code] — reseller detail + related rows
// PATCH  /api/admin/resellers/[code] — edit reseller fields (see validator)
// DELETE /api/admin/resellers/[code] — soft delete (status → terminated)
//
// Per docs/plans/reseller-module-plan.md § C.5 admin approval flows.
// requireAdmin gate. Code is stored uppercase; URL is lowercased for
// aesthetics (mirrors accelerator/[slug] pattern).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin, AdminGateError } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normaliseResellerCode } from "@/lib/reseller/attribution";
import {
  validateAdminResellerPatch,
  type AdminResellerPatch,
} from "@/lib/reseller/admin-validator";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/resellers/[code]";

function readClientMeta(request: Request): { ip: string; ua: string } {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  const ua = request.headers.get("user-agent") || "";
  return { ip, ua };
}

async function gate() {
  const user = await getCurrentUser();
  try {
    requireAdmin(user);
    return { user };
  } catch (err) {
    if (err instanceof AdminGateError) {
      return { response: NextResponse.json({ ok: false, reason: err.code }, { status: 401 }) };
    }
    throw err;
  }
}

async function loadReseller(code: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { error: "not_configured" as const };
  const { data, error } = await supabase
    .from("resellers")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) return { error: "query_failed" as const, message: error.message };
  if (!data) return { error: "not_found" as const };
  return { supabase, row: data };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const g = await gate();
  if ("response" in g) return g.response;

  const { code: raw } = await params;
  const code = normaliseResellerCode(raw);
  if (!code) return NextResponse.json({ ok: false, reason: "code_required" }, { status: 400 });

  const load = await loadReseller(code);
  if ("error" in load) {
    if (load.error === "not_found") {
      return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    }
    if (load.error === "not_configured") {
      return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
    }
    return NextResponse.json(
      { ok: false, reason: load.error, error: load.message },
      { status: 500 },
    );
  }

  const { supabase, row } = load;

  const [codesRes, adminsRes, attributionsRes, commissionsRes] = await Promise.all([
    supabase
      .from("reseller_promotion_codes")
      .select("id, tier_pct, code, stripe_coupon_id, stripe_promotion_code_id, active, created_at")
      .eq("reseller_id", row.id)
      .order("tier_pct", { ascending: true }),
    supabase
      .from("reseller_admins")
      .select("id, user_id, role, status, linked_at, revoked_at")
      .eq("reseller_id", row.id)
      .order("linked_at", { ascending: false }),
    supabase
      .from("reseller_attributions")
      .select("id, subject_type, status, source, attributed_at")
      .eq("reseller_id", row.id),
    supabase
      .from("reseller_commissions_current")
      .select(
        "commission_id, stripe_invoice_id, list_price_aud_cents, discount_pct, commission_aud_cents, net_owed_cents, status, created_at",
      )
      .eq("reseller_id", row.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const promotion_codes = codesRes.data ?? [];
  const admins = adminsRes.data ?? [];
  const attributions = attributionsRes.data ?? [];
  const commissions = commissionsRes.data ?? [];

  const attributions_summary = {
    total: attributions.length,
    active: attributions.filter((a) => a.status === "active").length,
    by_source: attributions.reduce<Record<string, number>>((acc, a) => {
      acc[a.source] = (acc[a.source] ?? 0) + 1;
      return acc;
    }, {}),
  };

  return NextResponse.json({
    ok: true,
    reseller: row,
    promotion_codes,
    admins,
    attributions_summary,
    commissions,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const g = await gate();
  if ("response" in g) return g.response;

  const { code: raw } = await params;
  const code = normaliseResellerCode(raw);
  if (!code) return NextResponse.json({ ok: false, reason: "code_required" }, { status: 400 });

  let body: AdminResellerPatch = {};
  try {
    body = (await request.json()) as AdminResellerPatch;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  const load = await loadReseller(code);
  if ("error" in load) {
    if (load.error === "not_found") {
      return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    }
    if (load.error === "not_configured") {
      return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
    }
    return NextResponse.json(
      { ok: false, reason: load.error, error: load.message },
      { status: 500 },
    );
  }

  const { supabase, row } = load;

  const validation = validateAdminResellerPatch(
    {
      billing_model: row.billing_model,
      gst_registered: row.gst_registered,
      abn: row.abn ?? null,
    },
    body,
  );

  if (!validation.ok) {
    const status = validation.reason === "empty_patch" ? 400 : 400;
    return NextResponse.json({ ok: false, reason: validation.reason }, { status });
  }

  const { data, error } = await supabase
    .from("resellers")
    .update({ ...validation.patch, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, reason: "update_failed", error: error.message },
      { status: 500 },
    );
  }

  // Observability record for the admin edit. Non-fatal: the resellers row
  // is already committed; a 500 out of a downstream audit hiccup would
  // misleadingly suggest the update rolled back. Mirrors the
  // requests/[id] PATCH pattern added tick 186.
  try {
    const { ip, ua } = readClientMeta(request);
    await supabase.from("reseller_audit_log").insert({
      reseller_id: row.id,
      actor_user_id: g.user.id,
      subject_user_id: null,
      action: "update_reseller",
      fields: Object.keys(validation.patch),
      route: ROUTE,
      ip,
      user_agent: ua,
      metadata: {
        code: row.code,
        patch: validation.patch,
      },
    });
  } catch (err) {
    console.warn("[admin.reseller.PATCH] reseller_audit_log insert failed", err);
  }

  return NextResponse.json({ ok: true, reseller: data });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const g = await gate();
  if ("response" in g) return g.response;

  const { code: raw } = await params;
  const code = normaliseResellerCode(raw);
  if (!code) return NextResponse.json({ ok: false, reason: "code_required" }, { status: 400 });

  const load = await loadReseller(code);
  if ("error" in load) {
    if (load.error === "not_found") {
      return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    }
    if (load.error === "not_configured") {
      return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
    }
    return NextResponse.json(
      { ok: false, reason: load.error, error: load.message },
      { status: 500 },
    );
  }

  const { supabase, row } = load;

  const { error } = await supabase
    .from("resellers")
    .update({ status: "terminated", updated_at: new Date().toISOString() })
    .eq("id", row.id);

  if (error) {
    return NextResponse.json(
      { ok: false, reason: "terminate_failed", error: error.message },
      { status: 500 },
    );
  }

  // Observability record for soft-delete. Non-fatal — the terminate flip
  // is already committed. Mirrors requests/[id] PATCH pattern (tick 186).
  try {
    const { ip, ua } = readClientMeta(request);
    await supabase.from("reseller_audit_log").insert({
      reseller_id: row.id,
      actor_user_id: g.user.id,
      subject_user_id: null,
      action: "terminate_reseller",
      fields: ["status"],
      route: ROUTE,
      ip,
      user_agent: ua,
      metadata: {
        code: row.code,
        previous_status: row.status,
      },
    });
  } catch (err) {
    console.warn("[admin.reseller.DELETE] reseller_audit_log insert failed", err);
  }

  return NextResponse.json({ ok: true });
}
