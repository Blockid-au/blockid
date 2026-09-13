// /api/fundraise/[roundId] — one fundraise round (S26-A).
//
//   GET    → the round, its commitments, the progress summary and — for a
//            draft — the project's existing data room, if any (viewer+)
//   PATCH  → { status: "closed" } closes an active round (ADMIN+ — it is
//            irreversible, `closed → []`, like a dividend void; S26 review
//            P3-8) and is audited as `fundraise.round.closed` (handler-level
//            `auditAction()` over the route's default verb); { roundName }
//            renames (editor+). Activation is its own route —
//            POST /api/fundraise/[roundId]/activate — because it attaches
//            (and may compile) the data room and carries its own audit
//            action, `fundraise.round.activated`.
//
// Access: lib/fundraise/rounds-server `resolveRoundForCaller` — session →
// projectScopeOrDeny(minRole) → the round keyed on the project OWNER's id.
// Stranger / wrong project / unknown id all answer one 404.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute, auditAction, auditNote } from "@/lib/audit/api-route";
import { canTransitionRound, isRoundStatus, summariseCommitments } from "@/lib/fundraise/commitments";
import { listCommitments, resolveRoundForCaller, ROUND_COLUMNS } from "@/lib/fundraise/rounds-server";
import { findRoomForScope } from "@/lib/dataroom/generate-room";

export const dynamic = "force-dynamic";

/** Audit action recorded when a PATCH closes the round (sibling of `fundraise.round.activated`). */
export const CLOSE_AUDIT_ACTION = "fundraise.round.closed";

type Ctx = { params: Promise<{ roundId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { roundId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const access = await resolveRoundForCaller(supabase, user, roundId, "viewer");
  if (!access.ok) return access.response;
  const { round, scope, ownerUserId } = access;

  const commitments = await listCommitments(supabase, round.id);
  const summary = summariseCommitments(commitments, round.target_amount);

  let dataRoom: { id: string; name: string | null } | null = null;
  if (round.data_room_id) {
    const { data } = await supabase.from("data_rooms").select("id, name").eq("id", round.data_room_id).maybeSingle();
    const r = data as { id: string; name: string | null } | null;
    if (r) dataRoom = { id: r.id, name: r.name ?? null };
  }
  // S26 review P2: the project's existing room (not yet attached) — the
  // "Open round" button must not promise a 3-credit compile when activation
  // will link this room for free. Draft rounds only; nothing is written.
  let projectDataRoom: { id: string; name: string | null } | null = null;
  if (!dataRoom && round.status === "draft") {
    projectDataRoom = await findRoomForScope(supabase, { ownerUserId, projectId: round.project_id ?? scope?.projectId ?? null });
  }

  return NextResponse.json({
    ok: true,
    round,
    commitments,
    summary,
    dataRoom,
    projectDataRoom,
    role: scope?.role ?? "owner",
    canEdit: !scope || scope.role === "owner" || scope.role === "admin" || scope.role === "editor",
    // Closing is irreversible → owner / admin only (PATCH enforces it; this only hides the button).
    canClose: !scope || scope.role === "owner" || scope.role === "admin",
  });
}

interface PatchBody {
  status?: unknown;
  roundName?: unknown;
}

async function PATCH_handler(req: NextRequest, ctx: Ctx) {
  const { roundId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });

  // Closing is irreversible → admin+; everything else on this route is editor+.
  const closing = body.status === "closed";
  const access = await resolveRoundForCaller(supabase, user, roundId, closing ? "admin" : "editor");
  if (!access.ok) return access.response;
  const { round, ownerUserId } = access;

  const patch: Record<string, unknown> = {};
  if (body.roundName !== undefined) {
    const name = typeof body.roundName === "string" ? body.roundName.replace(/\s+/g, " ").trim().slice(0, 120) : "";
    if (!name) return NextResponse.json({ ok: false, error: "roundName must be a non-empty string" }, { status: 400 });
    patch.round_name = name;
  }
  if (body.status !== undefined) {
    if (!isRoundStatus(body.status)) {
      return NextResponse.json({ ok: false, error: "status must be draft, active or closed" }, { status: 400 });
    }
    if (body.status === "active") {
      return NextResponse.json(
        { ok: false, error: "use_activate_route", message: `POST /api/fundraise/${round.id}/activate to open the round` },
        { status: 409 },
      );
    }
    if (body.status !== round.status) {
      if (!canTransitionRound(round.status, body.status)) {
        return NextResponse.json(
          { ok: false, error: "invalid_transition", message: `A ${round.status} round cannot move to ${body.status}` },
          { status: 409 },
        );
      }
      patch.status = body.status;
      if (body.status === "closed") patch.closed_at = new Date().toISOString();
    }
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("fundraise_rounds")
    .update(patch)
    .eq("id", round.id)
    .eq("account_id", ownerUserId)
    .select(ROUND_COLUMNS)
    .maybeSingle();
  if (error) {
    console.error("[fundraise] round patch failed", error);
    return NextResponse.json({ ok: false, error: "Failed to update round" }, { status: 500 });
  }
  if (patch.status === "closed") auditAction(CLOSE_AUDIT_ACTION);
  auditNote(round.id, { status: patch.status ?? null, renamed: patch.round_name !== undefined });
  return NextResponse.json({ ok: true, round: data ?? { ...round, ...patch } });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const PATCH = apiRoute({ route: "api/fundraise/[roundId]/route.ts", method: "PATCH" }, PATCH_handler);
