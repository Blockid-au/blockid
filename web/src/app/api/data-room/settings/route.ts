// /api/data-room/settings — the founder's trust settings for a room (S21-A).
//
//   GET  ?dataRoomId=…  → { settings: { ndaRequired, ndaText, ndaVersion,
//                           watermarkEnabled, entitled, canEdit, … },
//                           acceptances: [...] }
//   PUT  { dataRoomId?, ndaRequired?, ndaText?, watermarkEnabled?, bumpVersion? }
//
// Member-aware via lib/dataroom/room-access.ts: owner always; project
// members read as `viewer`, write as `admin` — an editor can upload
// documents but the NDA clause is a legal setting, admin-and-up only. A
// stranger gets 404.
//
// Plan gating: PUT refuses with 402 `feature_locked` when the OWNER's plan
// lacks investor_links.premium (founder_starter+). GET still returns the
// stored values with `entitled:false` so the UI can explain the upgrade
// instead of hiding the panel.

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { apiRoute, auditNote } from "@/lib/audit/api-route";
import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_NDA_TEXT, normaliseNdaVersion, parseNdaSettingsBody } from "@/lib/dataroom/nda";
import { ownerTrustEntitled, TRUST_FEATURE } from "@/lib/dataroom/nda-server";
import { resolveRoomForCaller, ROOM_TRUST_COLS, type RoomTrustRow } from "@/lib/dataroom/room-access";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function shape(room: RoomTrustRow, entitled: boolean, canEdit: boolean, role: string) {
  return {
    dataRoomId: room.id,
    ndaRequired: Boolean(room.nda_required),
    ndaText: room.nda_text ?? null,
    ndaVersion: normaliseNdaVersion(room.nda_version),
    watermarkEnabled: Boolean(room.watermark_enabled),
    defaultNdaText: DEFAULT_NDA_TEXT,
    entitled,
    feature: TRUST_FEATURE,
    canEdit,
    role,
  };
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const dataRoomId = new URL(req.url).searchParams.get("dataRoomId");
  const resolved = await resolveRoomForCaller(user, dataRoomId, "viewer");
  if (!resolved.ok) return resolved.response;
  const { room, canEdit, role } = resolved;

  const entitled = await ownerTrustEntitled(room.user_id);

  // The acceptance ledger, newest first — "who signed, when, which version".
  const { data: acceptances } = await supabase
    .from("data_room_nda_acceptances")
    .select("id, access_token_id, nda_version, viewer_email, ua_family, accepted_at")
    .eq("data_room_id", room.id)
    .order("accepted_at", { ascending: false })
    .limit(100);

  return NextResponse.json({
    ok: true,
    settings: shape(room, entitled, canEdit, role),
    acceptances: ((acceptances ?? []) as Array<Record<string, unknown>>).map((a) => ({
      id: a.id,
      linkId: a.access_token_id,
      version: a.nda_version,
      viewerEmail: (a.viewer_email as string | null) ?? null,
      uaFamily: (a.ua_family as string | null) ?? null,
      acceptedAt: a.accepted_at,
    })),
  });
}

async function PUT_handler(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = parseNdaSettingsBody(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  const dataRoomId = typeof body?.dataRoomId === "string" ? body.dataRoomId : null;
  const resolved = await resolveRoomForCaller(user, dataRoomId, "admin");
  if (!resolved.ok) return resolved.response;
  const { room, canEdit, role } = resolved;

  const entitled = await ownerTrustEntitled(room.user_id);
  if (!entitled) {
    return NextResponse.json(
      { ok: false, error: "feature_locked", feature: TRUST_FEATURE, reason: "plan" },
      { status: 402 },
    );
  }

  const currentVersion = normaliseNdaVersion(room.nda_version);
  const patch: Record<string, unknown> = { ...parsed.patch, updated_at: new Date().toISOString() };
  if (parsed.bumpVersion) patch.nda_version = currentVersion + 1;

  const { data: updated, error } = await supabase
    .from("data_rooms")
    .update(patch)
    .eq("id", room.id)
    .select(ROOM_TRUST_COLS)
    .maybeSingle();
  if (error || !updated) {
    console.error("[blockid:data-room/settings] update failed", error);
    return NextResponse.json({ ok: false, error: "Could not save settings" }, { status: 500 });
  }

  const next = updated as RoomTrustRow;
  auditNote(room.id, {
    nda_required: next.nda_required,
    watermark_enabled: next.watermark_enabled,
    nda_version: next.nda_version,
    bumped: parsed.bumpVersion,
  });

  return NextResponse.json({ ok: true, settings: shape(next, entitled, canEdit, role) });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const PUT = apiRoute({ route: "api/data-room/settings/route.ts", method: "PUT" }, PUT_handler);
