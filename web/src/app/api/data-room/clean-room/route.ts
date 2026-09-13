// /api/data-room/clean-room — the clean-room preparation checklist (S29-A).
//
//   GET    viewer+ → { checklist: { stages[], done, total, pct, roomExists },
//          roomId, updatedAt, role }. Computed tasks come from the project's
//          data room (NDA gate, watermark, links, engagement); founder tasks
//          from `clean_room_checklists` (0380). No project → empty checklist
//          with every task undone.
//   PATCH  editor+ → { taskId, done, note? } for a FOUNDER task; a computed
//          task is refused with 409 `computed_task` (the room decides it).
//          Upserts the ACTIVE project's row and returns the recomputed
//          checklist.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { readJsonBody } from "@/lib/security/request-guards";
import { apiRoute, auditNote } from "@/lib/audit/api-route";
import { buildCleanRoomChecklist, CLEAN_ROOM_NOTE, parseCleanRoomPatch } from "@/lib/dataroom/clean-room";
import { loadCleanRoomChecklist, saveCleanRoomTask } from "@/lib/dataroom/clean-room-server";

export const dynamic = "force-dynamic";

const BODY_MAX_BYTES = 4 * 1024;
const EMPTY_SIGNALS = { roomExists: false, ndaRequired: false, watermarkEnabled: false, links: [], engagementEvents: 0 };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: true, role: null, roomId: null, updatedAt: null, note: CLEAN_ROOM_NOTE, checklist: buildCleanRoomChecklist(EMPTY_SIGNALS, {}) });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const { checklist, roomId, updatedAt } = await loadCleanRoomChecklist(supabase, { projectId: scope.projectId, ownerUserId: scope.ownerUserId });
  return NextResponse.json({ ok: true, role: scope.role, roomId, updatedAt, note: CLEAN_ROOM_NOTE, checklist });
}

async function PATCH_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const read = await readJsonBody<unknown>(request, BODY_MAX_BYTES);
  if (!read.ok) {
    if (read.status === 413) return read.response;
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parseCleanRoomPatch(read.body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });

  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "project_required" }, { status: 404 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const saved = await saveCleanRoomTask(supabase, scope.projectId, parsed.taskId, parsed.done, parsed.note);
  if (!saved) return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  auditNote(scope.projectId, { task: parsed.taskId, done: parsed.done });
  const { checklist, roomId, updatedAt } = await loadCleanRoomChecklist(supabase, { projectId: scope.projectId, ownerUserId: scope.ownerUserId });
  return NextResponse.json({ ok: true, role: scope.role, roomId, updatedAt, note: CLEAN_ROOM_NOTE, checklist });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const PATCH = apiRoute({ route: "api/data-room/clean-room/route.ts", method: "PATCH" }, PATCH_handler);
