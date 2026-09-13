// Clean-room guide — server assembly (S29-A).
//
// Loads the data-room signals the pure checklist (`clean-room.ts`) computes
// from, and the founder-ticked task states, for a project scope keyed on
// the OWNER (S17-A):
//
//   room     `data_rooms` — the project's room (project_id), else the
//            owner's newest room (legacy rooms carry no project_id)
//   links    `data_room_access_tokens` for that room — recipient, sections,
//            access level, active / expired / revoked
//   events   `data_room_engagement` count for that room
//   tasks    `clean_room_checklists.tasks` (migration 0380)

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCleanRoomChecklist, normaliseStoredTasks, type CleanRoomChecklist, type CleanRoomSignals, type StoredCleanRoomTasks } from "./clean-room";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CleanRoomDb = SupabaseClient<any, any, any>;

export interface CleanRoomScope {
  projectId: string;
  ownerUserId: string;
}

interface RoomRow {
  id: string;
  user_id: string | null;
  project_id: string | null;
  nda_required: boolean | null;
  watermark_enabled: boolean | null;
  updated_at?: string | null;
}

interface LinkRow {
  id: string;
  data_room_id?: string | null;
  investor_email: string | null;
  investor_name: string | null;
  sections_allowed: unknown;
  access_level: string | null;
  is_active: boolean | null;
  expires_at: string | null;
  revoked_at?: string | null;
}

const ROOM_COLS = "id, user_id, project_id, nda_required, watermark_enabled, updated_at";

async function findRoom(db: CleanRoomDb, scope: CleanRoomScope): Promise<RoomRow | null> {
  const { data: byProject } = await db.from("data_rooms").select(ROOM_COLS).eq("project_id", scope.projectId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const p = (byProject as RoomRow | null) ?? null;
  if (p && p.project_id === scope.projectId) return p;
  const { data: byOwner } = await db.from("data_rooms").select(ROOM_COLS).eq("user_id", scope.ownerUserId).is("project_id", null).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const o = (byOwner as RoomRow | null) ?? null;
  return o && o.user_id === scope.ownerUserId && !o.project_id ? o : null;
}

/** Pure — exported for the suite: a link row → the signal the checklist reads. */
export function linkSignal(row: LinkRow, now: Date = new Date()): CleanRoomSignals["links"][number] {
  const sections = Array.isArray(row.sections_allowed) ? row.sections_allowed.filter((s) => typeof s === "string" && s.trim().length > 0) : [];
  const expired = typeof row.expires_at === "string" && Number.isFinite(new Date(row.expires_at).getTime()) && new Date(row.expires_at).getTime() < now.getTime();
  const revoked = typeof row.revoked_at === "string" && row.revoked_at.length > 0;
  return {
    hasRecipient: Boolean((row.investor_email ?? "").trim() || (row.investor_name ?? "").trim()),
    sectionsRestricted: sections.length > 0,
    accessLevel: (row.access_level ?? "view").toLowerCase(),
    active: row.is_active !== false && !expired && !revoked,
  };
}

export async function loadCleanRoomSignals(db: CleanRoomDb, scope: CleanRoomScope, now: Date = new Date()): Promise<CleanRoomSignals & { roomId: string | null }> {
  const room = await findRoom(db, scope);
  if (!room) return { roomId: null, roomExists: false, ndaRequired: false, watermarkEnabled: false, links: [], engagementEvents: 0 };
  const [{ data: links }, { count }] = await Promise.all([
    db.from("data_room_access_tokens").select("id, data_room_id, investor_email, investor_name, sections_allowed, access_level, is_active, expires_at, revoked_at").eq("data_room_id", room.id).limit(500),
    db.from("data_room_engagement").select("id", { count: "exact", head: true }).eq("data_room_id", room.id),
  ]);
  const rows = ((links as LinkRow[] | null) ?? []).filter((l) => l && (!l.data_room_id || l.data_room_id === room.id));
  return {
    roomId: room.id,
    roomExists: true,
    ndaRequired: Boolean(room.nda_required),
    watermarkEnabled: Boolean(room.watermark_enabled),
    links: rows.map((l) => linkSignal(l, now)),
    engagementEvents: typeof count === "number" && count > 0 ? count : 0,
  };
}

export async function loadStoredCleanRoomTasks(db: CleanRoomDb, projectId: string): Promise<{ tasks: StoredCleanRoomTasks; updatedAt: string | null }> {
  const { data } = await db.from("clean_room_checklists").select("project_id, tasks, updated_at").eq("project_id", projectId).maybeSingle();
  const row = (data as { project_id?: string; tasks?: unknown; updated_at?: string | null } | null) ?? null;
  if (!row || row.project_id !== projectId) return { tasks: {}, updatedAt: null };
  return { tasks: normaliseStoredTasks(row.tasks), updatedAt: row.updated_at ?? null };
}

/** Tick / untick one founder task (the caller has already refused computed ids). Returns the stored tasks after the write, or null on failure. */
export async function saveCleanRoomTask(db: CleanRoomDb, projectId: string, taskId: string, done: boolean, note: string | null, now: Date = new Date()): Promise<StoredCleanRoomTasks | null> {
  const current = await loadStoredCleanRoomTasks(db, projectId);
  const next: StoredCleanRoomTasks = { ...current.tasks, [taskId]: { done, at: done ? now.toISOString() : null, note } };
  const { error } = await db.from("clean_room_checklists").upsert({ project_id: projectId, tasks: next, updated_at: now.toISOString() }, { onConflict: "project_id" });
  if (error) {
    console.error("[clean-room] task upsert failed", error);
    return null;
  }
  return next;
}

export async function loadCleanRoomChecklist(db: CleanRoomDb, scope: CleanRoomScope, now: Date = new Date()): Promise<{ checklist: CleanRoomChecklist; roomId: string | null; updatedAt: string | null }> {
  const [signals, stored] = await Promise.all([loadCleanRoomSignals(db, scope, now), loadStoredCleanRoomTasks(db, scope.projectId)]);
  return { checklist: buildCleanRoomChecklist(signals, stored.tasks), roomId: signals.roomId, updatedAt: stored.updatedAt };
}
