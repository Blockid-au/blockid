// PATCH | GET /api/accelerator/onboarding/metrics — the Cohort onboarding
// success metrics of the caller's organisation (G25, 2026-09-21; was
// /api/pilots/[orderId]/metrics on `pilot_orders.metrics` before the paid
// pilot was retired). Stored on `org_settings.onboarding_metrics` (0438).
//
//   PATCH  body = a partial `onboardingMetricsSchema`
//          (lib/accelerator/onboarding-metrics.ts): only the sent keys
//          change, `null` clears one, unknown keys are rejected (400).
//          Owner of the acting organisation only (resolveOrgAdmin →
//          isOwner; an invited seat reads, never writes). Audit row
//          `accelerator.onboarding_metrics_updated` with the changed keys
//          (never the free-text notes).
//   GET    the stored metrics for any seat of the organisation.
//
//   401 anonymous · 404 no organisation · 403 seat that does not own the
//   org (PATCH) · 400 bad body · 503 before migration 0438 · 200 { ok,
//   org_id, metrics, updated_at }.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveOrgAdmin } from "@/lib/org/admin";
import { parseOnboardingMetrics } from "@/lib/accelerator/onboarding-metrics";
import { readOnboardingMetricsForOrg, writeOnboardingMetricsForOrg } from "@/lib/accelerator/onboarding-store";
import { apiRoute } from "@/lib/audit/api-route";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const admin = await resolveOrgAdmin({ id: user.id, plan: user.plan ?? null });
  if (admin.status === "no_org" || !admin.org) return NextResponse.json({ ok: false, error: "not_found", message: "No organisation on this account yet." }, { status: 404 });
  const value = await readOnboardingMetricsForOrg(admin.org.id);
  return NextResponse.json({ ok: true, org_id: value.orgId, available: value.available, can_edit: admin.isOwner, metrics: value.metrics, updated_at: value.updatedAt });
}

async function PATCH_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const limited = enforceRateLimit("onboarding-metrics", user.id, request, 30, 60 * 60 * 1000);
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const parsed = parseOnboardingMetrics(raw);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: "bad_body", message: parsed.message, issues: parsed.issues }, { status: 400 });

  const admin = await resolveOrgAdmin({ id: user.id, plan: user.plan ?? null });
  if (admin.status === "no_org" || !admin.org) return NextResponse.json({ ok: false, error: "not_found", message: "No organisation on this account yet." }, { status: 404 });
  if (!admin.isOwner) return NextResponse.json({ ok: false, error: "not_org_owner", message: "Only the organisation owner can record the onboarding metrics." }, { status: 403 });

  const written = await writeOnboardingMetricsForOrg(admin.org.id, parsed.value, { id: user.id });
  if (!written.ok) return NextResponse.json({ ok: false, error: written.error, message: written.message }, { status: written.error === "unavailable" ? 503 : 500 });
  return NextResponse.json({ ok: true, org_id: written.value.orgId, metrics: written.value.metrics, updated_at: written.value.updatedAt });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const PATCH = apiRoute({ route: "api/accelerator/onboarding/metrics/route.ts", method: "PATCH" }, PATCH_handler);
