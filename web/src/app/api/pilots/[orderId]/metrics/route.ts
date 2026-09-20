// PATCH | GET /api/pilots/[orderId]/metrics — the success metrics of one paid
// Cohort Validation Pilot (G21 P2-C, 2026-09-20), stored on
// `pilot_orders.metrics` (jsonb, migration 0416).
//
//   PATCH  body = a partial `pilotMetricsSchema` (lib/pilots/metrics.ts):
//          only the sent keys change, `null` clears one, unknown keys are
//          rejected (400). Owner of the order only (pilot_orders.user_id =
//          caller). Writes an audit row `pilot.metrics_updated` with the
//          changed keys (never the free-text notes).
//   GET    the stored metrics for the owner.
//
//   401 anonymous · 400 bad body · 404 not the caller's order (or the table
//   is absent) · 200 { ok, metrics }.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { mergePilotMetrics, parsePilotMetrics, readPilotMetrics, PILOT_METRIC_KEYS } from "@/lib/pilots/metrics";
import { apiRoute } from "@/lib/audit/api-route";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ orderId: string }> };

async function ownOrder(userId: string, orderId: string): Promise<{ id: string; metrics: Record<string, unknown> } | null> {
  const sb = getSupabaseAdmin();
  if (!sb || !/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  const { data, error } = await sb.from("pilot_orders").select("id, user_id, metrics").eq("id", orderId).eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  const row = data as { id: string; metrics: unknown };
  return { id: String(row.id), metrics: row.metrics && typeof row.metrics === "object" ? (row.metrics as Record<string, unknown>) : {} };
}

export async function GET(_request: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { orderId } = await ctx.params;
  const order = await ownOrder(user.id, orderId);
  if (!order) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, order_id: order.id, metrics: readPilotMetrics(order.metrics) });
}

async function PATCH_handler(request: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const limited = enforceRateLimit("pilot-metrics", user.id, request, 30, 60 * 60 * 1000);
  if (limited) return limited;
  const { orderId } = await ctx.params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const parsed = parsePilotMetrics(raw);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: "bad_body", message: parsed.message, issues: parsed.issues }, { status: 400 });

  const order = await ownOrder(user.id, orderId);
  if (!order) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const nowIso = new Date().toISOString();
  const merged = mergePilotMetrics(order.metrics, parsed.value, nowIso);
  const { error } = await sb.from("pilot_orders").update({ metrics: merged, updated_at: nowIso }).eq("id", order.id).eq("user_id", user.id);
  if (error) {
    console.error("[blockid:pilots] metrics update failed", { code: error.code, message: error.message });
    return NextResponse.json({ ok: false, error: "db_error", message: "Could not save the pilot metrics. Please try again." }, { status: 500 });
  }

  const changed = PILOT_METRIC_KEYS.filter((k) => k in parsed.value && k !== "notes");
  try {
    const { appendAudit } = await import("@/lib/audit");
    await appendAudit({
      user_id: user.id,
      actor: "user",
      action: "pilot.metrics_updated",
      resource_type: "pilot_order",
      resource_id: order.id,
      detail: { keys: changed, case_study_consent: typeof parsed.value.case_study_consent === "boolean" ? parsed.value.case_study_consent : undefined },
    });
  } catch (err) {
    console.error("[blockid:pilots] metrics audit failed", err instanceof Error ? err.message : String(err));
  }

  return NextResponse.json({ ok: true, order_id: order.id, metrics: readPilotMetrics(merged), updated_at: nowIso });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const PATCH = apiRoute({ route: "api/pilots/[orderId]/metrics/route.ts", method: "PATCH" }, PATCH_handler);
