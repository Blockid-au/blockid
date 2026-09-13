// POST /api/fundraise/[roundId]/activate — open a round (S26-A).
//
// draft → active, and the project's data room is attached: an existing
// room is linked (never regenerated); with none — and the owner plan
// carrying data_room.access — the same compile the manual "Generate data
// room" button runs is charged to the CALLER's credits (3.00) and attached.
// No credits / no entitlement → the round still opens and the response
// says why no room was attached (`dataRoom.attached = "none"`), so the UI
// can offer the button. Idempotent: an active round answers 200 with
// `alreadyActive: true` and, at most, gets a room attached.
//
// Audit action: `fundraise.round.activated` (meta.action override).

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute, auditNote } from "@/lib/audit/api-route";
import { gateRequireFeature } from "@/lib/feature-gate";
import { canTransitionRound } from "@/lib/fundraise/commitments";
import { activateRound, resolveRoundForCaller } from "@/lib/fundraise/rounds-server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ roundId: string }> };

async function POST_handler(_req: NextRequest, ctx: Ctx) {
  const { roundId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const access = await resolveRoundForCaller(supabase, user, roundId, "editor");
  if (!access.ok) return access.response;
  const { round, scope, ownerUserId } = access;

  if (round.status !== "active" && !canTransitionRound(round.status, "active")) {
    return NextResponse.json(
      { ok: false, error: "invalid_transition", message: `A ${round.status} round cannot be activated` },
      { status: 409 },
    );
  }

  // The data-room feature gate decides whether a MISSING room may be
  // compiled; it never blocks the activation itself.
  const gate = await gateRequireFeature("data_room.access");

  try {
    const result = await activateRound(supabase, {
      round,
      user,
      scope,
      ownerUserId,
      canGenerate: gate.ok,
    });
    auditNote(round.id, {
      already_active: result.alreadyActive,
      data_room_attached: result.dataRoom.attached,
      data_room_id: result.dataRoom.id,
    });
    return NextResponse.json({
      ok: true,
      round: result.round,
      alreadyActive: result.alreadyActive,
      dataRoom: result.dataRoom,
    });
  } catch (err) {
    console.error("[fundraise] activate failed", err);
    return NextResponse.json({ ok: false, error: "Failed to activate round" }, { status: 500 });
  }
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute(
  { route: "api/fundraise/[roundId]/activate/route.ts", method: "POST", action: "fundraise.round.activated", entity: "fundraise_round" },
  POST_handler,
);
