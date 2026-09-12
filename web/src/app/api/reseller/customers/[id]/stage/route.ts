// POST /api/reseller/customers/[id]/stage — manual pipeline-stage override.
//
// G2 #7 (real-world workflow parity audit gap #7, S19-B). A channel partner
// can move an attributed customer to any stage of the partner pipeline
// (lead → onboarded → scored → data_room → fundraising → invested, or
// churned) in either direction; the nightly auto-updater then only advances
// past that on evidence dated after the override (customer-stage.ts).
//
// Chokepoint order (D3-CISO-01):
//   1. getCurrentUser()           — session identity
//   2. scopedReseller(user)       — reseller_id membership
//   3. role ∈ {owner, admin}      — viewers may look, not move
//   4. id ∈ allowedCustomerIds()  — attributed to THIS reseller
//   5. upsert reseller_customers (stage_source='manual')
//   6. reseller_audit_log action='set_customer_stage' (append-only, 0093)
//
// The audit row is written BEFORE the upsert so a failed write can never
// leave an unlogged mutation; a failed audit write aborts the request.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { ResellerScopeError, scopedReseller } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";
import { decideReveal } from "@/lib/reseller/customer-reveal";
import {
  CUSTOMER_STAGES,
  resolveManualTransition,
} from "@/lib/reseller/customer-stage";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

const ROUTE = "/api/reseller/customers/[id]/stage";

const BodySchema = z
  .object({
    stage: z.enum(CUSTOMER_STAGES),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

function readClientMeta(request: Request): { ip: string; ua: string } {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  const ua = request.headers.get("user-agent") || "";
  return { ip, ua };
}

async function POST_handler(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "unauthorised" }, { status: 401 });
  }

  let scope;
  try {
    scope = await scopedReseller(user);
  } catch (err) {
    if (err instanceof ResellerScopeError) {
      return NextResponse.json({ ok: false, reason: err.code }, { status: 403 });
    }
    throw err;
  }

  if (scope.role !== "owner" && scope.role !== "admin") {
    return NextResponse.json({ ok: false, reason: "not_admin" }, { status: 403 });
  }

  const { id } = await params;
  const allowed = await scope.allowedCustomerIds();
  const decision = decideReveal(id, allowed);
  if (!decision.ok) {
    const status = decision.reason === "not_in_scope" ? 403 : 400;
    return NextResponse.json({ ok: false, reason: decision.reason }, { status });
  }

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, reason: "bad_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { stage, note } = parsed.data;

  const db = resellerSupabase(scope);
  const [current] = await db.customerStages([decision.customerId]);
  const transition = resolveManualTransition(
    current
      ? { stage: current.stage, stage_source: current.stage_source, stage_updated_at: current.stage_updated_at }
      : null,
    stage,
  );
  if (!transition.changed) {
    return NextResponse.json({
      ok: true,
      changed: false,
      stage: transition.to,
      stage_source: "manual",
      stage_updated_at: current?.stage_updated_at ?? null,
    });
  }

  const { ip, ua } = readClientMeta(request);
  try {
    await db.auditLog({
      actor_user_id: user.id,
      subject_user_id: decision.customerId,
      action: "set_customer_stage",
      fields: ["stage"],
      route: ROUTE,
      ip,
      user_agent: ua,
      metadata: {
        from: transition.from,
        to: transition.to,
        previous_source: current?.stage_source ?? null,
        note: note ?? null,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "audit_failed", error: (err as Error).message },
      { status: 500 },
    );
  }

  try {
    const { stage_updated_at } = await db.setCustomerStage({
      customer_user_id: decision.customerId,
      stage: transition.to,
      actor_user_id: user.id,
      note: note ?? null,
    });
    return NextResponse.json({
      ok: true,
      changed: true,
      from: transition.from,
      stage: transition.to,
      stage_source: "manual",
      stage_updated_at,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "write_failed", error: (err as Error).message },
      { status: 500 },
    );
  }
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/reseller/customers/[id]/stage/route.ts", method: "POST" }, POST_handler);
