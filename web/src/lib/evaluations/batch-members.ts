// batch-members — reviewer roles on a BlockID Cohort (G21 P2-B; migration
// 0423 `evaluation_batch_members`).
//
//   owner     the batch creator (evaluation_batches.user_id) by construction,
//             plus any explicit `owner` row — invites / removes members,
//             everything a reviewer can do
//   reviewer  shortlist · review status · overrides · decisions
//   viewer    read-only (table, compare, decision log, CSV)
//
//   assertBatchRole(batchId, userId, minRole)  the ONE membership check every
//   batch route uses. Loads the batch by id (no owner filter — members must
//   see it), then resolves the caller's role. `not_found` for a non-member
//   (the id space stays non-enumerable), `forbidden` when the role is below
//   `minRole`. Fail-soft before 0423: the members table missing → only the
//   owner passes.
//
// Invites are by e-mail to an EXISTING BlockID account (the seat model of
// the evaluator organisation, 0403, stays separate): unknown e-mail → 404
// with a hint; the member gets a short e-mail through lib/email.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { appendAudit } from "@/lib/audit";
import { complianceFooter, sendEmail } from "@/lib/email";
import { isMissingRelation } from "@/lib/investors/mandates";
import { mapBatchRow, type EvaluationBatch } from "./batch-shared";

type Row = Record<string, unknown>;

export const BATCH_ROLES = ["owner", "reviewer", "viewer"] as const;
export type BatchRole = (typeof BATCH_ROLES)[number];

const ROLE_RANK: Record<BatchRole, number> = { viewer: 1, reviewer: 2, owner: 3 };

/** Pure: is `role` at least `minRole`? */
export function batchRoleAtLeast(role: BatchRole, minRole: BatchRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

export interface BatchMember {
  userId: string;
  role: BatchRole;
  email: string | null;
  displayName: string | null;
  invitedBy: string | null;
  createdAt: string;
  /** True for the creator row synthesised from evaluation_batches.user_id. */
  isCreator: boolean;
}

export type BatchAccess =
  | { ok: true; batch: EvaluationBatch; role: BatchRole; isCreator: boolean }
  | { ok: false; error: "not_found" | "forbidden" | "unavailable" };

const BATCH_COLUMNS = "id, user_id, name, rubric_weights, status, total, done_count, failed_count, created_at, started_at, finished_at";

/** One batch by id, whoever owns it. Null when missing / DB off. */
export async function getBatchById(batchId: string): Promise<EvaluationBatch | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase.from("evaluation_batches").select(BATCH_COLUMNS).eq("id", batchId).maybeSingle();
  if (error || !data) return null;
  return mapBatchRow(data as Row);
}

/** The caller's explicit member row on a batch (null before 0423 / when none). */
export async function loadMemberRole(batchId: string, userId: string): Promise<BatchRole | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase.from("evaluation_batch_members").select("role").eq("batch_id", batchId).eq("user_id", userId).maybeSingle();
  if (error) {
    if (!isMissingRelation(error)) console.error("[blockid:batch-members] role read failed", error);
    return null;
  }
  const role = (data as Row | null)?.role;
  return typeof role === "string" && (BATCH_ROLES as readonly string[]).includes(role) ? (role as BatchRole) : null;
}

/** Pure: resolve the effective role from the creator id + the member row. */
export function resolveBatchRole(batch: Pick<EvaluationBatch, "userId">, userId: string, memberRole: BatchRole | null): { role: BatchRole; isCreator: boolean } | null {
  if (batch.userId === userId) return { role: "owner", isCreator: true };
  if (memberRole) return { role: memberRole, isCreator: false };
  return null;
}

/**
 * The membership gate. `not_found` when the batch does not exist OR the
 * caller is not on it; `forbidden` when the seat is below `minRole`.
 */
export async function assertBatchRole(batchId: string, userId: string, minRole: BatchRole = "viewer"): Promise<BatchAccess> {
  if (!getSupabaseAdmin()) return { ok: false, error: "unavailable" };
  const batch = await getBatchById(batchId);
  if (!batch) return { ok: false, error: "not_found" };
  const memberRole = batch.userId === userId ? null : await loadMemberRole(batchId, userId);
  const resolved = resolveBatchRole(batch, userId, memberRole);
  if (!resolved) return { ok: false, error: "not_found" };
  if (!batchRoleAtLeast(resolved.role, minRole)) return { ok: false, error: "forbidden" };
  return { ok: true, batch, role: resolved.role, isCreator: resolved.isCreator };
}

/** Every seat on the batch — the creator first, then the member rows (with e-mail / name). */
export async function listBatchMembers(batch: EvaluationBatch): Promise<{ members: BatchMember[]; available: boolean }> {
  const supabase = getSupabaseAdmin();
  const creator: BatchMember = { userId: batch.userId, role: "owner", email: null, displayName: null, invitedBy: null, createdAt: batch.createdAt, isCreator: true };
  if (!supabase) return { members: [creator], available: false };
  const { data, error } = await supabase
    .from("evaluation_batch_members")
    .select("user_id, role, invited_by, created_at")
    .eq("batch_id", batch.id)
    .order("created_at", { ascending: true });
  if (error) {
    if (!isMissingRelation(error)) console.error("[blockid:batch-members] list failed", error);
    return { members: [await withProfile(supabase, creator)], available: !isMissingRelation(error) };
  }
  const rows = ((data ?? []) as Row[]).filter((r) => String(r.user_id) !== batch.userId);
  const ids = [batch.userId, ...rows.map((r) => String(r.user_id))];
  const profiles = await loadProfiles(supabase, ids);
  const members: BatchMember[] = [
    { ...creator, ...(profiles.get(batch.userId) ?? {}) },
    ...rows.map((r) => ({
      userId: String(r.user_id),
      role: (BATCH_ROLES as readonly string[]).includes(String(r.role)) ? (String(r.role) as BatchRole) : "viewer",
      invitedBy: r.invited_by == null ? null : String(r.invited_by),
      createdAt: String(r.created_at ?? ""),
      isCreator: false,
      email: null,
      displayName: null,
      ...(profiles.get(String(r.user_id)) ?? {}),
    })),
  ];
  return { members, available: true };
}

type Db = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

async function loadProfiles(supabase: Db, ids: string[]): Promise<Map<string, { email: string | null; displayName: string | null }>> {
  const out = new Map<string, { email: string | null; displayName: string | null }>();
  if (ids.length === 0) return out;
  const { data } = await supabase.from("app_users").select("id, email, display_name").in("id", ids);
  for (const r of (data ?? []) as Row[]) out.set(String(r.id), { email: r.email == null ? null : String(r.email), displayName: r.display_name == null ? null : String(r.display_name) });
  return out;
}

async function withProfile(supabase: Db, m: BatchMember): Promise<BatchMember> {
  const p = (await loadProfiles(supabase, [m.userId])).get(m.userId);
  return p ? { ...m, ...p } : m;
}

export type AddMemberResult =
  | { ok: true; member: BatchMember; emailSent: boolean; already: boolean }
  | { ok: false; error: "unknown_email" | "invalid_email" | "self" | "unavailable" | "db_error"; message: string };

/** Pure: minimal e-mail shape check (the strict validation is the account's own). */
export function normaliseInviteEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !email.includes("@") || /\s/.test(email)) return null;
  return email;
}

/**
 * Owner action: put an EXISTING account on the batch with `role`. Idempotent
 * on (batch, user): a second invite updates the role. Unknown e-mail → the
 * caller answers 404 with a hint (the person registers first).
 */
export async function addBatchMember(input: {
  batch: EvaluationBatch;
  inviter: { id: string; email: string; displayName?: string | null };
  email: string;
  role: Exclude<BatchRole, "owner"> | "owner";
  siteBase?: string;
}): Promise<AddMemberResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "unavailable", message: "Database not configured" };
  const email = normaliseInviteEmail(input.email);
  if (!email) return { ok: false, error: "invalid_email", message: "Enter a valid e-mail address" };
  if (email === input.inviter.email.toLowerCase()) return { ok: false, error: "self", message: "You already own this cohort" };

  // ilike for case-insensitivity; % _ \ are escaped so "a_b@x.au" cannot match "aXb@x.au".
  const pattern = email.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data: userRow, error: userErr } = await supabase.from("app_users").select("id, email, display_name").ilike("email", pattern).limit(1).maybeSingle();
  if (userErr) return { ok: false, error: "db_error", message: userErr.message ?? "Lookup failed" };
  if (!userRow || String((userRow as Row).email ?? "").toLowerCase() !== email) return { ok: false, error: "unknown_email", message: "No BlockID account with that e-mail yet — ask them to sign up at /signup first, then invite again." };
  const target = userRow as Row;
  const userId = String(target.id);
  if (userId === input.batch.userId) return { ok: false, error: "self", message: "That account already owns this cohort" };

  const { data: existing } = await supabase.from("evaluation_batch_members").select("role").eq("batch_id", input.batch.id).eq("user_id", userId).maybeSingle();
  const already = !!existing;
  const { data, error } = await supabase
    .from("evaluation_batch_members")
    .upsert({ batch_id: input.batch.id, user_id: userId, role: input.role, invited_by: input.inviter.id }, { onConflict: "batch_id,user_id" })
    .select("user_id, role, invited_by, created_at")
    .maybeSingle();
  if (error || !data) {
    if (isMissingRelation(error)) return { ok: false, error: "unavailable", message: "Cohort reviewer seats are not available yet (migration 0423 pending)" };
    return { ok: false, error: "db_error", message: error?.message ?? "Invite failed" };
  }
  const r = data as Row;
  const member: BatchMember = {
    userId,
    role: input.role,
    email: target.email == null ? null : String(target.email),
    displayName: target.display_name == null ? null : String(target.display_name),
    invitedBy: r.invited_by == null ? null : String(r.invited_by),
    createdAt: String(r.created_at ?? ""),
    isCreator: false,
  };

  let emailSent = false;
  if (!already) {
    try {
      const base = (input.siteBase ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au").replace(/\/+$/, "");
      const url = `${base}/workspace/evaluations/cohort/${encodeURIComponent(input.batch.id)}`;
      const { subject, html, text } = buildCohortInviteEmail({ inviterName: input.inviter.displayName?.trim() || input.inviter.email, cohortName: input.batch.name, role: input.role, url });
      const { unsubscribeUrl, footerHtml } = await complianceFooter(email);
      const sent = await sendEmail({ to: email, subject, html: html + footerHtml, text, unsubscribeUrl });
      emailSent = sent.ok;
    } catch (err) {
      console.error("[blockid:batch-members] invite e-mail failed", err);
    }
  }
  void appendAudit({
    user_id: input.inviter.id,
    actor: "user",
    action: already ? "cohort.member_role_changed" : "cohort.member_added",
    resource_type: "evaluation_batch",
    resource_id: input.batch.id,
    detail: { member_user_id: userId, role: input.role, email_sent: emailSent },
  }).catch(() => {});
  return { ok: true, member, emailSent, already };
}

/** Owner action: drop a member row (the creator can never be removed). */
export async function removeBatchMember(input: { batch: EvaluationBatch; actorId: string; userId: string }): Promise<{ ok: true; removed: boolean } | { ok: false; error: "creator" | "unavailable" | "db_error"; message: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "unavailable", message: "Database not configured" };
  if (input.userId === input.batch.userId) return { ok: false, error: "creator", message: "The cohort owner cannot be removed" };
  const { data, error } = await supabase.from("evaluation_batch_members").delete().eq("batch_id", input.batch.id).eq("user_id", input.userId).select("user_id");
  if (error) {
    if (isMissingRelation(error)) return { ok: false, error: "unavailable", message: "Cohort reviewer seats are not available yet (migration 0423 pending)" };
    return { ok: false, error: "db_error", message: error.message ?? "Remove failed" };
  }
  const removed = ((data ?? []) as Row[]).length > 0;
  if (removed) {
    void appendAudit({ user_id: input.actorId, actor: "user", action: "cohort.member_removed", resource_type: "evaluation_batch", resource_id: input.batch.id, detail: { member_user_id: input.userId } }).catch(() => {});
  }
  return { ok: true, removed };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Pure: the invite e-mail (subject + HTML + text twin). */
export function buildCohortInviteEmail(input: { inviterName: string; cohortName: string; role: BatchRole; url: string }): { subject: string; html: string; text: string } {
  const roleLine = input.role === "viewer" ? "view the cohort table, comparisons and the decision log" : input.role === "reviewer" ? "shortlist, set review status, record overrides with a reason code and draft decisions" : "manage the cohort, including inviting reviewers";
  const subject = `${input.inviterName} added you to the BlockID Cohort “${input.cohortName}”`;
  const text = `${input.inviterName} added you as ${input.role} on the BlockID Cohort “${input.cohortName}”.\n\nAs ${input.role} you can ${roleLine}.\n\nOpen the cohort: ${input.url}\n\nBlockID structures the evidence and standardises the first-pass analysis. Humans make the decision.`;
  const html = `<p>${escapeHtml(input.inviterName)} added you as <strong>${input.role}</strong> on the BlockID Cohort “${escapeHtml(input.cohortName)}”.</p>
<p>As ${input.role} you can ${roleLine}.</p>
<p><a href="${escapeHtml(input.url)}">Open the cohort</a></p>
<p style="color:#4b5563;font-size:13px">BlockID structures the evidence and standardises the first-pass analysis. Humans make the decision.</p>`;
  return { subject, html, text };
}
