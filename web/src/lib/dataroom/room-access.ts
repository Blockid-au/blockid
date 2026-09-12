// Who may read / administer a data room's founder-side surfaces (S21-A).
//
// Shared by /api/data-room/settings and /api/data-room/engage GET so the
// two answer "is this caller allowed to see this room?" identically:
//
//   - the OWNER (data_rooms.user_id) always may read and write;
//   - a project member reads with `viewer` and administers with `admin` via
//     assertProjectScope on the room's project_id (S17-A: no owner-email
//     fallback, the role table is the authority);
//   - a caller who is neither gets 404, never 403, so a guessed room id is
//     not an oracle.

import "server-only";
import { NextResponse } from "next/server";
import type { AppUser } from "@/lib/auth";
import { assertProjectScope, ProjectAccessError, roleCanAdmin } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";

export interface RoomTrustRow {
  id: string;
  user_id: string | null;
  project_id: string | null;
  nda_required: boolean | null;
  nda_text: string | null;
  nda_version: number | null;
  watermark_enabled: boolean | null;
}

export const ROOM_TRUST_COLS =
  "id, user_id, project_id, nda_required, nda_text, nda_version, watermark_enabled";

export type ResolvedRoom =
  | { ok: true; room: RoomTrustRow; canEdit: boolean; role: string }
  | { ok: false; response: NextResponse };

const notFound = (): ResolvedRoom => ({
  ok: false,
  response: NextResponse.json({ ok: false, error: "Not found" }, { status: 404 }),
});

/**
 * Find the room (by id, else the caller's newest) and the caller's role on
 * it. `need` is the floor for a MEMBER — the owner passes regardless.
 */
export async function resolveRoomForCaller(
  user: AppUser,
  dataRoomId: string | null,
  need: "viewer" | "admin",
): Promise<ResolvedRoom> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 }),
    };
  }

  let room: RoomTrustRow | null = null;
  if (dataRoomId) {
    const { data } = await supabase.from("data_rooms").select(ROOM_TRUST_COLS).eq("id", dataRoomId).maybeSingle();
    room = (data as RoomTrustRow | null) ?? null;
  } else {
    const { data } = await supabase
      .from("data_rooms")
      .select(ROOM_TRUST_COLS)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    room = (data as RoomTrustRow | null) ?? null;
  }
  if (!room) return notFound();

  if (room.user_id === user.id) return { ok: true, room, canEdit: true, role: "owner" };

  if (!room.project_id) return notFound();
  try {
    const scope = await assertProjectScope(user, room.project_id, "viewer");
    const canEdit = roleCanAdmin(scope.role);
    if (need === "admin" && !canEdit) {
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: "forbidden", message: "Only the owner or an admin can change trust settings." },
          { status: 403 },
        ),
      };
    }
    return { ok: true, room, canEdit, role: scope.role };
  } catch (err) {
    if (err instanceof ProjectAccessError || (err as { name?: string })?.name === "ProjectAccessError") {
      return notFound();
    }
    throw err;
  }
}
