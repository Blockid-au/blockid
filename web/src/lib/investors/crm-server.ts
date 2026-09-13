// Investor CRM — the server half (S28-B).
//
// Every route under api/investors/crm/** resolves the caller the same way:
// session → `projectScopeOrDeny(minRole)` (403 below the role) → the
// project id the tables are keyed on (`investor_contacts.project_id`,
// migration 0375). A caller with no project gets a 409 `no_project` —
// the CRM has nothing to hang a contact on until a startup profile exists.
//
// The two automatic touchpoint writers (`linkDataRoomView`,
// `linkCommitment`) are called from the S26-A code paths — the
// `investor_viewed` notifier and the commitments routes — and NEVER throw:
// a CRM nicety must not fail an investor-facing beacon or a cheque insert.

import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectMemberRole, ProjectScope } from "@/lib/projects";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import {
  cursorOrFilter,
  encodeCursor,
  isContactStage,
  isStageAdvance,
  normaliseEmail,
  STAGE_LABEL,
  type ContactListFilters,
  type ContactRow,
  type ContactStage,
  type TouchpointKind,
  type TouchpointRow,
} from "./crm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export const CONTACT_COLUMNS =
  "id, project_id, name, email, org, role, type, stage, source, tags, last_touch_at, next_step, next_step_due, owner_user_id, created_by, archived_at, created_at, updated_at";

export const TOUCHPOINT_COLUMNS = "id, contact_id, project_id, kind, body, occurred_at, created_by, meta, created_at";

export type CrmAccess =
  | { ok: true; projectId: string; ownerUserId: string; scope: ProjectScope }
  | { ok: false; response: NextResponse };

/**
 * Resolve the caller's project at `minRole`. `scope` null (no project on
 * the session) → 409 `no_project` with a founder-facing message.
 */
export async function resolveCrmScope(minRole: ProjectMemberRole): Promise<CrmAccess> {
  const { scope, denied } = await projectScopeOrDeny(minRole);
  if (denied) return { ok: false, response: denied };
  if (!scope) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "no_project", message: "Create your startup profile first — the investor pipeline belongs to a project." },
        { status: 409 },
      ),
    };
  }
  return { ok: true, projectId: scope.projectId, ownerUserId: scope.ownerUserId, scope };
}

/**
 * S29-hardening (S28 review #8): may `userId` be a contact's `owner_user_id`
 * on this project? The project OWNER always; otherwise only an ACCEPTED
 * `project_members` row for (project, user). `null` / undefined (unassigned)
 * is always fine. A lookup error counts as "not a member" (never assign to
 * someone we could not verify).
 */
export async function isProjectMemberOrOwner(
  supabase: Db,
  args: { projectId: string; ownerUserId: string; userId: string | null | undefined },
): Promise<boolean> {
  if (!args.userId) return true;
  if (args.userId === args.ownerUserId) return true;
  try {
    const { data, error } = await supabase
      .from("project_members")
      .select("id, project_id, user_id, status")
      .eq("project_id", args.projectId)
      .eq("user_id", args.userId)
      .eq("status", "accepted")
      .limit(1);
    if (error) return false;
    // Defensive re-check — the test fake ignores filters.
    return ((data as Array<{ project_id?: string; user_id?: string | null; status?: string }> | null) ?? []).some(
      (m) => m.project_id === args.projectId && m.user_id === args.userId && m.status === "accepted",
    );
  } catch {
    return false;
  }
}

/** The 400 every CRM write answers when `ownerUserId` is not on the project. */
export function ownerNotMemberResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "owner_not_member", message: "The contact owner must be the project owner or an accepted member of this project." },
    { status: 400 },
  );
}

// ── Contacts ─────────────────────────────────────────────────────────────

export interface ContactPage {
  contacts: ContactRow[];
  nextCursor: string | null;
}

/**
 * One page of contacts for a project, newest first, keyset-paginated on
 * (created_at, id). Stage / type / tag filters go to the database; the
 * free-text search is an `ilike` across name / email / org.
 */
export async function listContacts(supabase: Db, projectId: string, f: ContactListFilters): Promise<ContactPage> {
  let q = supabase.from("investor_contacts").select(CONTACT_COLUMNS).eq("project_id", projectId);
  if (!f.includeArchived) q = q.is("archived_at", null);
  if (f.stage) q = q.eq("stage", f.stage);
  if (f.type) q = q.eq("type", f.type);
  if (f.tag) q = q.contains("tags", [f.tag]);
  if (f.search) {
    const s = f.search.replace(/[%_,()]/g, " ").trim();
    if (s) q = q.or(`name.ilike.%${s}%,email.ilike.%${s}%,org.ilike.%${s}%`);
  }
  if (f.cursor) q = q.or(cursorOrFilter(f.cursor));
  const { data } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(f.limit + 1);
  const rows = ((data ?? []) as ContactRow[]).slice();
  const hasMore = rows.length > f.limit;
  const page = hasMore ? rows.slice(0, f.limit) : rows;
  const last = page[page.length - 1];
  return { contacts: page, nextCursor: hasMore && last ? encodeCursor(last) : null };
}

/** Every live contact on the project (the pipeline summary + the digest need the lot; capped). */
export async function listAllLiveContacts(supabase: Db, projectId: string, limit = 2000): Promise<ContactRow[]> {
  const { data } = await supabase
    .from("investor_contacts")
    .select(CONTACT_COLUMNS)
    .eq("project_id", projectId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ContactRow[];
}

export async function getContact(supabase: Db, projectId: string, contactId: string): Promise<ContactRow | null> {
  if (!contactId || contactId.length > 64) return null;
  const { data } = await supabase
    .from("investor_contacts")
    .select(CONTACT_COLUMNS)
    .eq("id", contactId)
    .eq("project_id", projectId)
    .maybeSingle();
  const row = data as ContactRow | null;
  // The fake in tests answers the first row regardless of filters — re-check
  // the pair so a wrong project can never read another founder's contact.
  if (!row || row.id !== contactId || row.project_id !== projectId) return null;
  return row;
}

/** Contact by (project, lower-cased email) — the auto-link key. Archived rows count too: a revived conversation belongs to its history. */
export async function findContactByEmail(supabase: Db, projectId: string, email: string | null | undefined): Promise<ContactRow | null> {
  const e = normaliseEmail(email);
  if (!e) return null;
  const { data } = await supabase
    .from("investor_contacts")
    .select(CONTACT_COLUMNS)
    .eq("project_id", projectId)
    .eq("email", e)
    .maybeSingle();
  const row = data as ContactRow | null;
  if (!row || row.project_id !== projectId || row.email !== e) return null;
  return row;
}

/**
 * The cheques on the owner's rounds that belong to this project (a legacy
 * round with no project_id counts as the owner's). Matched to contacts in
 * memory by `summarisePipeline`.
 */
export async function listProjectCommitments(
  supabase: Db,
  args: { ownerUserId: string; projectId: string },
): Promise<Array<{ investor_email: string | null; amount_aud: number | string | null; status: string; round_id: string }>> {
  const { data: rounds } = await supabase.from("fundraise_rounds").select("id, project_id").eq("account_id", args.ownerUserId);
  const roundIds = ((rounds ?? []) as Array<{ id: string; project_id: string | null }>)
    .filter((r) => !r.project_id || r.project_id === args.projectId)
    .map((r) => r.id);
  if (roundIds.length === 0) return [];
  const { data } = await supabase
    .from("fundraise_commitments")
    .select("investor_email, amount_aud, status, round_id")
    .eq("account_id", args.ownerUserId)
    .in("round_id", roundIds)
    .limit(2000);
  return ((data ?? []) as Array<{ investor_email: string | null; amount_aud: number | string | null; status: string; round_id: string }>).filter((k) =>
    roundIds.includes(k.round_id),
  );
}

// ── Touchpoints ──────────────────────────────────────────────────────────

export async function listTouchpoints(supabase: Db, projectId: string, contactId: string, limit = 200): Promise<TouchpointRow[]> {
  const { data } = await supabase
    .from("investor_touchpoints")
    .select(TOUCHPOINT_COLUMNS)
    .eq("project_id", projectId)
    .eq("contact_id", contactId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as TouchpointRow[];
}

export interface AppendTouchpointArgs {
  contact: Pick<ContactRow, "id" | "project_id" | "last_touch_at">;
  kind: TouchpointKind;
  body: string | null;
  occurredAt?: string;
  createdBy: string | null;
  meta?: Record<string, unknown>;
  /** Default true: bump `last_touch_at` when this event is newer. `status_change` rows pass false. */
  touch?: boolean;
}

/**
 * Insert one timeline row and (unless `touch: false`) move the contact's
 * `last_touch_at` forward when the event is newer than the current stamp.
 * Returns the inserted row (or the shape that was sent when the client
 * cannot echo it back).
 */
export async function appendTouchpoint(supabase: Db, args: AppendTouchpointArgs): Promise<TouchpointRow | null> {
  const occurredAt = args.occurredAt ?? new Date().toISOString();
  const payload = {
    contact_id: args.contact.id,
    project_id: args.contact.project_id,
    kind: args.kind,
    body: args.body,
    occurred_at: occurredAt,
    created_by: args.createdBy,
    meta: args.meta ?? {},
  };
  const { data, error } = await supabase.from("investor_touchpoints").insert(payload).select(TOUCHPOINT_COLUMNS).maybeSingle();
  if (error) {
    console.error("[investors:crm] touchpoint insert failed", error);
    return null;
  }
  if (args.touch !== false && (!args.contact.last_touch_at || args.contact.last_touch_at < occurredAt)) {
    const { error: touchErr } = await supabase
      .from("investor_contacts")
      .update({ last_touch_at: occurredAt, updated_at: new Date().toISOString() })
      .eq("id", args.contact.id)
      .eq("project_id", args.contact.project_id);
    if (touchErr) console.error("[investors:crm] last_touch_at update failed", touchErr);
  }
  return (data as TouchpointRow | null) ?? ({ id: "", created_at: occurredAt, ...payload } as TouchpointRow);
}

/**
 * Move a contact to `stage` and write the `status_change` row
 * (`meta: { from, to, auto? }`). No-op when the stage is unchanged.
 */
export async function changeStage(
  supabase: Db,
  args: { contact: ContactRow; to: ContactStage; actorUserId: string | null; auto?: string },
): Promise<ContactRow> {
  const { contact, to } = args;
  if (contact.stage === to) return contact;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("investor_contacts")
    .update({ stage: to, updated_at: now })
    .eq("id", contact.id)
    .eq("project_id", contact.project_id)
    .select(CONTACT_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`investor contact stage update failed: ${error.message}`);
  const body = args.auto ? `Moved to ${STAGE_LABEL[to]} automatically (${args.auto})` : `Moved from ${STAGE_LABEL[contact.stage]} to ${STAGE_LABEL[to]}`;
  await appendTouchpoint(supabase, {
    contact,
    kind: "status_change",
    body,
    occurredAt: now,
    createdBy: args.actorUserId,
    meta: { from: contact.stage, to, ...(args.auto ? { auto: args.auto } : {}) },
    touch: false,
  });
  return (data as ContactRow | null) ?? { ...contact, stage: to, updated_at: now };
}

// ── S26-A auto-link hooks (never throw) ──────────────────────────────────

export interface LinkOutcome {
  matched: boolean;
  contactId: string | null;
  stageMovedTo: ContactStage | null;
  /** S28-review: a matching row already sat inside the window — nothing was written. */
  throttled?: boolean;
}

const NONE: LinkOutcome = { matched: false, contactId: null, stageMovedTo: null };

/**
 * S28-review P1: one `data_room_view` row per (contact, link, trigger) per
 * window. The engage beacon calls the hook on EVERY event, and once the
 * cumulative depth crosses the deep-read threshold every later section /
 * dwell event is a `deep_read` trigger — without this a single read session
 * wrote dozens of identical rows, and a link holder could flood the
 * timeline past the 200-row page. Same 24 h window as the founder
 * notification (`INVESTOR_VIEWED_THROTTLE_MS`).
 */
export const DATA_ROOM_VIEW_TOUCHPOINT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** True when a `data_room_view` row for this link + trigger already sits inside the window (re-checked on the row — the test fake ignores filters). */
export async function recentDataRoomViewExists(
  supabase: Db,
  args: { contactId: string; projectId: string; linkId: string; trigger: string; now?: Date; windowMs?: number },
): Promise<boolean> {
  const now = args.now ?? new Date();
  const since = new Date(now.getTime() - (args.windowMs ?? DATA_ROOM_VIEW_TOUCHPOINT_WINDOW_MS)).toISOString();
  const { data } = await supabase
    .from("investor_touchpoints")
    .select("id, contact_id, project_id, kind, occurred_at, meta")
    .eq("project_id", args.projectId)
    .eq("contact_id", args.contactId)
    .eq("kind", "data_room_view")
    .contains("meta", { link_id: args.linkId, trigger: args.trigger })
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(5);
  return ((data ?? []) as Array<Pick<TouchpointRow, "contact_id" | "project_id" | "kind" | "occurred_at" | "meta">>).some((r) => {
    const meta = (r?.meta ?? {}) as Record<string, unknown>;
    return (
      r.contact_id === args.contactId &&
      r.project_id === args.projectId &&
      r.kind === "data_room_view" &&
      meta.link_id === args.linkId &&
      meta.trigger === args.trigger &&
      typeof r.occurred_at === "string" &&
      r.occurred_at >= since
    );
  });
}

/**
 * Data-room link opened / read deeply (called from
 * lib/dataroom/investor-viewed after the trigger fires). A contact whose
 * email matches the link's `investor_email` gets a `data_room_view` row —
 * at most one per (link, trigger) per 24 h (`recentDataRoomViewExists`;
 * a repeat inside the window answers `throttled: true` and writes nothing).
 * A view is a signal, not a meeting: the stage is left alone, only the
 * timeline and `last_touch_at` move.
 */
export async function linkDataRoomView(
  supabase: Db,
  args: { projectId: string | null | undefined; email: string | null | undefined; linkId: string; trigger: string; roomName?: string | null; sections?: number; now?: Date },
): Promise<LinkOutcome> {
  try {
    if (!args.projectId) return NONE;
    const contact = await findContactByEmail(supabase, args.projectId, args.email);
    if (!contact) return NONE;
    if (await recentDataRoomViewExists(supabase, { contactId: contact.id, projectId: args.projectId, linkId: args.linkId, trigger: args.trigger, now: args.now })) {
      return { matched: true, contactId: contact.id, stageMovedTo: null, throttled: true };
    }
    const what = args.trigger === "deep_read" ? "read the data room in depth" : "opened the data room";
    await appendTouchpoint(supabase, {
      contact,
      kind: "data_room_view",
      body: `${contact.name} ${what}${args.roomName ? ` (${args.roomName})` : ""}${args.sections ? ` — ${args.sections} section${args.sections === 1 ? "" : "s"}` : ""}`,
      createdBy: null,
      meta: { link_id: args.linkId, trigger: args.trigger, sections: args.sections ?? null },
    });
    return { matched: true, contactId: contact.id, stageMovedTo: null };
  } catch (err) {
    console.warn("[investors:crm] data-room link hook failed", err instanceof Error ? err.message : err);
    return NONE;
  }
}

/** The contact stage a cheque status implies (soft → nothing: a soft-circle is a conversation, not a commitment). */
export function stageForCommitmentStatus(status: string): ContactStage | null {
  if (status === "committed" || status === "signed") return "committed";
  if (status === "funded") return "invested";
  return null;
}

/**
 * A cheque recorded or updated on a round (called from the S26-A
 * commitments routes). A contact whose email matches gets a `commitment`
 * row with the amount / status; when the cheque implies a later stage
 * than the contact is at (committed / signed → `committed`, funded →
 * `invested`) the contact is advanced — never moved backwards, and a
 * `withdrawn` cheque only writes the row.
 */
export async function linkCommitment(
  supabase: Db,
  args: {
    projectId: string | null | undefined;
    email: string | null | undefined;
    commitmentId: string | null;
    roundId: string;
    roundName?: string | null;
    amountAud: number | string | null;
    status: string;
    event: "created" | "updated";
    actorUserId: string | null;
  },
): Promise<LinkOutcome> {
  try {
    if (!args.projectId) return NONE;
    const contact = await findContactByEmail(supabase, args.projectId, args.email);
    if (!contact) return NONE;
    const amount = typeof args.amountAud === "number" ? args.amountAud : Number(args.amountAud ?? 0);
    const aud = Number.isFinite(amount) ? new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(amount) : "";
    const verb = args.event === "created" ? "recorded" : "updated";
    await appendTouchpoint(supabase, {
      contact,
      kind: "commitment",
      body: `Commitment ${verb}: ${aud} · ${args.status}${args.roundName ? ` on ${args.roundName}` : ""}`,
      createdBy: args.actorUserId,
      meta: { commitment_id: args.commitmentId, round_id: args.roundId, status: args.status, amount_aud: Number.isFinite(amount) ? amount : null },
    });
    const implied = stageForCommitmentStatus(args.status);
    let moved: ContactStage | null = null;
    if (implied && isContactStage(contact.stage) && isStageAdvance(contact.stage, implied)) {
      await changeStage(supabase, { contact, to: implied, actorUserId: args.actorUserId, auto: `cheque ${args.status}` });
      moved = implied;
    }
    return { matched: true, contactId: contact.id, stageMovedTo: moved };
  } catch (err) {
    console.warn("[investors:crm] commitment link hook failed", err instanceof Error ? err.message : err);
    return NONE;
  }
}
