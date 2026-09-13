import { NextResponse } from "next/server";
import { gateRequireFeature } from "@/lib/feature-gate";
import { getSupabaseAdmin } from "@/lib/supabase";
import { spendCredits } from "@/lib/credits";
import { getProjectScope, creditChargeNote } from "@/lib/projects";
import { projectAccessResponse } from "@/lib/project-members/http";
import { compileDataRoom, findRoomForScope } from "@/lib/dataroom/generate-room";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/data-room/generate — the scope's EXISTING room, never a compile
//
// S30-B live QA (P2): `room-trust-settings` + `engagement-heatmap` rendered
// only in the browser session that pressed Generate, because the room id
// lived in DataRoomClient state. The client now asks this on mount and seeds
// the same state, so NDA / watermark controls, the link list and the heatmap
// survive a reload. Same scope rules as the POST (owner or any accepted
// member — viewer floor, since reading the id is not a mutation) and the
// same `findRoomForScope` the fundraise activation path uses; no credits.
// ---------------------------------------------------------------------------

export async function GET() {
  const gate = await gateRequireFeature("data_room.access");
  if (!gate.ok) return gate.response;
  const user = gate.user;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Database not configured" },
      { status: 503 },
    );
  }

  let scope;
  try {
    scope = await getProjectScope("viewer");
  } catch (err) {
    const denied = projectAccessResponse(err);
    if (denied) return denied;
    throw err;
  }
  const projectId = scope?.projectId ?? null;
  const ownerUserId = scope?.ownerUserId ?? user.id;

  const room = await findRoomForScope(supabase, { ownerUserId, projectId });
  return NextResponse.json({
    ok: true,
    dataRoomId: room?.id ?? null,
    name: room?.name ?? null,
    role: scope?.role ?? "owner",
  });
}

// ---------------------------------------------------------------------------
// POST /api/data-room/generate — One-click Data Room Generator
//
// Compiles a structured data room from user's existing data across
// SVI accounts, analyses, metrics, cap table, and evidence vault.
// Costs 3.00 credits.
// ---------------------------------------------------------------------------

async function POST_handler() {
  const gate = await gateRequireFeature("data_room.access");
  if (!gate.ok) return gate.response;
  const user = gate.user;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Database not configured" },
      { status: 503 },
    );
  }

  // ── Project scope (S17-A) ─────────────────────────────────────────────
  // editor+ on the active project (owner always passes). The room is the
  // OWNER's (ownerUserId / dataEmail) so a co-founder regenerates the same
  // room; the 3 credits come out of the CALLER's wallet — `creditNote`.
  let scope;
  try {
    scope = await getProjectScope("editor");
  } catch (err) {
    const denied = projectAccessResponse(err);
    if (denied) return denied;
    throw err;
  }
  const projectId = scope?.projectId ?? null;
  const dataEmail = scope?.dataEmail ?? user.email;
  const ownerUserId = scope?.ownerUserId ?? user.id;
  const creditNote = creditChargeNote(scope);

  // ── Charge credits ────────────────────────────────────────────────────
  const spend = await spendCredits(user.id, "data_room_generate", {
    email: user.email,
    project_id: projectId,
  });
  if (!spend.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Insufficient credits",
        balance: spend.balance,
        cost: 3.0,
        creditNote,
      },
      { status: 402 },
    );
  }

  // ── Compile + persist (lib/dataroom/generate-room.ts) ─────────────────
  // S26-A: the same worker the fundraise activation path calls, so a room
  // attached to a round is exactly the room this button produces.
  const compiled = await compileDataRoom(supabase, {
    user: { email: user.email, displayName: user.displayName ?? null },
    ownerUserId,
    dataEmail,
    projectId,
  });
  const { dataRoomId, dataRoom, documents } = compiled;

  return NextResponse.json({
    ok: true,
    dataRoomId,
    dataRoom,
    documents,
    creditsUsed: 3.0,
    creditNote,
    role: scope?.role ?? "owner",
    balance: spend.balance,
  });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/data-room/generate/route.ts", method: "POST" }, POST_handler);
