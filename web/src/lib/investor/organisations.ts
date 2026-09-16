// Investor organisations — seats & consensus (G13-W5-D3, S-D3; BA spec
// docs/plans/investor-clarity-2026-09-15/10-ba-investor-dossier-taxonomy.md
// §A.3 block 4 "Multi-evaluator view", §A.4 "Seats", §A.5 E4.5 / F1–F4,
// Appendix 2 "Consensus"; goal doc §3 D2).
//
// One `investor_organisations` row (0393) is the Firm / Program grouping.
// Every user already gets a PERSONAL org on first mandate save (S-T2
// `getOrCreatePersonalOrg`); S-D3 makes that org the team: the owner
// invites seats into it within the plan's seat limit
// (`plans.usage_limits.seats` — Scout 1 · Firm 3 · Program 5; -1 =
// unlimited), the invitee accepts a magic link with the account whose
// email matches, and from then on:
//
//   * `resolveDossierAccess` (dossier.ts) lets any seat of the evaluator's
//     org open the evaluator's dossier as an ASSESSOR of their own seat
//     (F1: same report / valuation blocks, own "My view" form);
//   * `readConsensus` reads every seat's CURRENT assessment on the
//     evaluation (0393 "same-org seat may SELECT"), masks private_notes
//     (assessments.ts `toSeatVisible`) and computes the Appendix-2
//     consensus: median rating per dimension over SUBMITTED rows, decision
//     tally, `disagreement` = dimensions whose seat ratings span ≥ 2
//     ("Discuss" marker), header "Firm consensus (submitted/seats)".
//
// The acting org of a user = the first org they are a seat of that they do
// NOT own (an invited seat acts for the firm), else their personal org.
// Writes stamp `evaluation_assessments.org_id` with it (S-D2 left it null).
//
// Every reader is 42P01-guarded: before 0393 / 0403 are applied the team
// page renders "not available yet" and the consensus block is empty.

import "server-only";
import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { appendAudit } from "@/lib/audit";
import { getPlanCached } from "@/lib/plans-db";
import { LEGACY_PLAN_MAP } from "@/lib/plans";
import { planIdToTier, type PlanTier } from "@/lib/segments";
import { sendEmail, complianceFooter } from "@/lib/email";
import { getOrCreatePersonalOrg, isMissingRelation, type InvestorOrganisation } from "@/lib/investors/mandates";
import {
  ASSESSMENT_COLUMNS,
  ASSESSMENT_DIM_KEYS,
  mapAssessmentRow,
  toSeatVisible,
  type AssessmentDecision,
  type AssessmentDimKey,
  type EvaluationAssessment,
  type SeatVisibleAssessment,
} from "@/lib/evaluations/assessments";

type Row = Record<string, unknown>;

// ─── Seat limits (plans.csv usage_limits.seats) ─────────────────────────────

/** Fallback when the plans row cannot be read — mirrors plans.csv `seats`. */
export const SEAT_LIMIT_BY_TIER: Readonly<Partial<Record<PlanTier, number>>> = Object.freeze({
  angel: 1, // Scout
  advisor: 3, // Firm
  vc_small: 5, // Program
  vc_ent: Number.MAX_SAFE_INTEGER,
  accel_starter: 5,
  accel_growth: 15,
  accel_ent: Number.MAX_SAFE_INTEGER,
  enterprise: 5,
});

/** Read `plans.usage_limits.seats` (-1 / ≥ 9999 = unlimited), else the tier fallback, else 1. Never throws. */
export async function seatLimitFor(planId: string | null | undefined): Promise<number> {
  const resolved = LEGACY_PLAN_MAP[planId ?? ""]?.id ?? planId ?? "founder_free";
  try {
    const plan = await getPlanCached(resolved);
    const limits = (plan?.usage_limits ?? {}) as Record<string, unknown>;
    const n = limits.seats;
    if (typeof n === "number" && Number.isFinite(n)) return n < 0 || n >= 9999 ? Number.MAX_SAFE_INTEGER : Math.max(1, Math.floor(n));
  } catch {
    /* plans table unreadable → tier fallback */
  }
  return SEAT_LIMIT_BY_TIER[planIdToTier(planId)] ?? 1;
}

/** Firm and above may hold more than one seat; Scout's single seat is the owner. */
export function seatsUpgradeHint(limit: number): string {
  if (limit >= Number.MAX_SAFE_INTEGER) return "";
  return limit <= 1
    ? "Scout is a single seat. Firm (A$149/mo) adds 3 seats with a shared dossier; Program (A$349/mo) adds 5."
    : limit <= 3
      ? "Firm includes 3 seats. Program (A$349/mo) includes 5 seats plus batch scoring and the LP report."
      : `Your plan includes ${limit} seats. Contact sales for more.`;
}

// ─── Row shapes ──────────────────────────────────────────────────────────────

export interface OrgMember {
  id: string;
  userId: string;
  role: string;
  displayName: string | null;
  email: string | null;
  isOwner: boolean;
  joinedAt: string;
}

export interface OrgInvite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
  /** Only the owner ever receives the token (to copy the link); never listed to seats. */
  token?: string;
}

export interface OrgTeam {
  /** false while 0393 / 0403 are not applied (or the admin client is missing). */
  available: boolean;
  org: InvestorOrganisation | null;
  /** True when the viewer owns the org (may invite / remove). */
  isOwner: boolean;
  members: OrgMember[];
  invites: OrgInvite[];
  seats: { limit: number; used: number; remaining: number; unlimited: boolean };
}

const EMPTY_TEAM = (available: boolean): OrgTeam => ({ available, org: null, isOwner: false, members: [], invites: [], seats: { limit: 1, used: 0, remaining: 0, unlimited: false } });

function orgFromRow(r: Row): InvestorOrganisation {
  return {
    id: String(r.id),
    slug: String(r.slug ?? ""),
    name: String(r.name ?? ""),
    kind: (r.kind as InvestorOrganisation["kind"]) ?? "angel",
    owner_user_id: r.owner_user_id ? String(r.owner_user_id) : null,
    is_personal: r.is_personal === true,
  };
}

// ─── Acting org ──────────────────────────────────────────────────────────────

/**
 * The org a user acts for: the first org they are a seat of but do not own
 * (an invited seat acts for the firm), else their personal org (created on
 * demand). Null when the tables are missing.
 */
export async function resolveActingOrg(userId: string): Promise<InvestorOrganisation | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return null;
  try {
    const { data, error } = await supabase
      .from("investor_organisation_members")
      .select("org_id, created_at, investor_organisations:org_id (id, slug, name, kind, owner_user_id, is_personal)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(20);
    if (error) {
      if (!isMissingRelation(error)) console.error("[blockid:organisations] membership read failed", error);
      return null;
    }
    for (const raw of (data ?? []) as Array<Row & { investor_organisations?: Row | Row[] | null }>) {
      const o = (Array.isArray(raw.investor_organisations) ? raw.investor_organisations[0] : raw.investor_organisations) ?? null;
      if (!o) continue;
      const org = orgFromRow(o);
      if (org.owner_user_id !== userId) return org;
    }
  } catch (err) {
    console.error("[blockid:organisations] resolveActingOrg threw", err);
    return null;
  }
  return getOrCreatePersonalOrg(userId);
}

/** True when `userId` is a seat of an org owned by someone else (an invited Firm / Program seat). */
export async function isOrgSeat(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return false;
  try {
    const { data, error } = await supabase
      .from("investor_organisation_members")
      .select("org_id, investor_organisations:org_id (owner_user_id)")
      .eq("user_id", userId)
      .limit(20);
    if (error || !data) return false;
    return (data as Array<Row & { investor_organisations?: Row | Row[] | null }>).some((raw) => {
      const o = (Array.isArray(raw.investor_organisations) ? raw.investor_organisations[0] : raw.investor_organisations) ?? null;
      return !!o && String(o.owner_user_id ?? "") !== userId;
    });
  } catch {
    return false;
  }
}

/** Seat user ids of an org (owner included). Empty when unavailable. */
export async function listSeatUserIds(orgId: string): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !orgId) return [];
  try {
    const { data, error } = await supabase.from("investor_organisation_members").select("user_id").eq("org_id", orgId).limit(200);
    if (error || !data) return [];
    return [...new Set((data as Row[]).map((r) => String(r.user_id ?? "")).filter(Boolean))];
  } catch {
    return [];
  }
}

/** Do `a` and `b` share an org? (F1: seat B may open the dossier seat A added.) */
export async function shareOrg(a: string, b: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !a || !b || a === b) return null;
  try {
    const { data, error } = await supabase.from("investor_organisation_members").select("org_id, user_id").in("user_id", [a, b]).limit(200);
    if (error || !data) return null;
    const byOrg = new Map<string, Set<string>>();
    for (const r of data as Row[]) {
      const org = String(r.org_id ?? "");
      if (!byOrg.has(org)) byOrg.set(org, new Set());
      byOrg.get(org)!.add(String(r.user_id ?? ""));
    }
    for (const [org, users] of byOrg) if (users.has(a) && users.has(b)) return org;
    return null;
  } catch {
    return null;
  }
}

// ─── Team read ───────────────────────────────────────────────────────────────

export async function getTeam(user: { id: string; plan: string | null }): Promise<OrgTeam> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return EMPTY_TEAM(false);
  const org = await resolveActingOrg(user.id);
  if (!org) return EMPTY_TEAM(false);
  const isOwner = org.owner_user_id === user.id;
  // The seat limit is the OWNER's plan — a Scout seat inside a Firm org does not shrink the firm.
  let ownerPlan: string | null = user.plan;
  if (!isOwner && org.owner_user_id) {
    const { data } = await supabase.from("app_users").select("plan").eq("id", org.owner_user_id).maybeSingle();
    ownerPlan = ((data as Row | null)?.plan as string | null) ?? null;
  }
  const limit = await seatLimitFor(ownerPlan);
  const [membersRes, invitesRes] = await Promise.all([
    supabase.from("investor_organisation_members").select("id, user_id, role, created_at, app_users:user_id (display_name, email)").eq("org_id", org.id).order("created_at", { ascending: true }).limit(200),
    supabase.from("investor_organisation_invites").select("id, email, role, token, expires_at, created_at").eq("org_id", org.id).is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: true }).limit(200),
  ]);
  if (membersRes.error) {
    if (!isMissingRelation(membersRes.error)) console.error("[blockid:organisations] members read failed", membersRes.error);
    return EMPTY_TEAM(false);
  }
  const members: OrgMember[] = ((membersRes.data ?? []) as Array<Row & { app_users?: Row | Row[] | null }>).map((raw) => {
    const u = (Array.isArray(raw.app_users) ? raw.app_users[0] : raw.app_users) ?? {};
    const uid = String(raw.user_id ?? "");
    return {
      id: String(raw.id),
      userId: uid,
      role: String(raw.role ?? "investment_partner"),
      displayName: u.display_name ? String(u.display_name) : null,
      email: u.email ? String(u.email) : null,
      isOwner: uid === org.owner_user_id,
      joinedAt: String(raw.created_at ?? ""),
    };
  });
  // The owner is always a seat even when the 0393 member row was never written.
  if (org.owner_user_id && !members.some((m) => m.userId === org.owner_user_id)) {
    members.unshift({ id: `owner-${org.owner_user_id}`, userId: org.owner_user_id, role: "investment_partner", displayName: null, email: null, isOwner: true, joinedAt: "" });
  }
  // 0403 not applied → no invites, but the team still renders.
  const invites: OrgInvite[] = invitesRes.error
    ? []
    : ((invitesRes.data ?? []) as Row[]).map((r) => ({
        id: String(r.id),
        email: String(r.email ?? ""),
        role: String(r.role ?? "investment_partner"),
        expiresAt: String(r.expires_at ?? ""),
        createdAt: String(r.created_at ?? ""),
        ...(isOwner ? { token: String(r.token ?? "") } : {}),
      }));
  const used = members.length + invites.length;
  const unlimited = limit >= Number.MAX_SAFE_INTEGER;
  return {
    available: true,
    org,
    isOwner,
    members,
    invites,
    seats: { limit: unlimited ? -1 : limit, used, remaining: unlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, limit - used), unlimited },
  };
}

export const listMembers = async (user: { id: string; plan: string | null }): Promise<OrgMember[]> => (await getTeam(user)).members;

// ─── Invite ──────────────────────────────────────────────────────────────────

export const SEAT_ROLES = ["investor_viewer", "investor_analyst", "investment_manager", "investment_partner", "ic_member", "fund_admin", "accelerator_analyst", "institutional_admin"] as const;
export type SeatRole = (typeof SEAT_ROLES)[number];
export const INVITE_TTL_DAYS = 14;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InviteError = "unavailable" | "not_owner" | "invalid_email" | "seat_limit" | "already_member" | "db_error";
export type InviteResult =
  | { ok: true; invite: OrgInvite; inviteUrl: string; emailSent: boolean; seats: OrgTeam["seats"] }
  | { ok: false; error: InviteError; message: string; limit?: number; used?: number; upgradeHint?: string };

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au").replace(/\/$/, "");
}

/** Where the magic link lands: the team page accepts the token once the invitee is signed in. */
export function inviteUrlForToken(token: string): string {
  const next = `/workspace/investor/team?invite=${encodeURIComponent(token)}`;
  return `${siteUrl()}/auth/login?next=${encodeURIComponent(next)}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Pure template — exported so the test pins the copy without sending. */
export function buildSeatInviteEmail(args: { inviterName: string; orgName: string; inviteUrl: string; expiresDays: number }): { subject: string; html: string } {
  const subject = `${args.inviterName} invited you to a seat at ${args.orgName} on BlockID`;
  const html = `<p>${escapeHtml(args.inviterName)} added you as a seat of <strong>${escapeHtml(args.orgName)}</strong> on BlockID.au.</p>
<p>As a seat you open the same Investor Dossier for every startup the firm evaluates, record your own assessment, and see the firm's consensus.</p>
<p><a href="${escapeHtml(args.inviteUrl)}">Accept your seat</a> — sign in (or create an account) with this email address. The link expires in ${args.expiresDays} days.</p>
<p style="color:#6b7280;font-size:12px">If you were not expecting this, ignore the email — nothing is shared until you accept.</p>`;
  return { subject, html };
}

export async function inviteMember(
  user: { id: string; plan: string | null; email: string; displayName?: string | null },
  input: { email: string; role?: SeatRole },
): Promise<InviteResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "unavailable", message: "Service unavailable" };
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, error: "invalid_email", message: "Enter a valid email address" };
  const role: SeatRole = input.role && (SEAT_ROLES as readonly string[]).includes(input.role) ? input.role : "investment_partner";

  const team = await getTeam(user);
  if (!team.available || !team.org) return { ok: false, error: "unavailable", message: "Seats are not available on this environment yet (migration 0393 / 0403 pending)" };
  if (!team.isOwner) return { ok: false, error: "not_owner", message: "Only the organisation owner can invite seats" };
  if (email === user.email.toLowerCase() || team.members.some((m) => m.email?.toLowerCase() === email)) {
    return { ok: false, error: "already_member", message: `${email} already holds a seat` };
  }
  const existing = team.invites.find((i) => i.email === email);
  if (!existing && !team.seats.unlimited && team.seats.used >= team.seats.limit) {
    // F4 — refused with the plan-limit message and the upgrade path (no Stripe change).
    return {
      ok: false,
      error: "seat_limit",
      message: `Your plan includes ${team.seats.limit} seat${team.seats.limit === 1 ? "" : "s"} (${team.seats.used} in use).`,
      limit: team.seats.limit,
      used: team.seats.used,
      upgradeHint: seatsUpgradeHint(team.seats.limit),
    };
  }

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString();
  let invite: OrgInvite;
  if (existing) {
    // Re-send: refresh the token + expiry on the open invite.
    const { data, error } = await supabase
      .from("investor_organisation_invites")
      .update({ token, expires_at: expiresAt, role, invited_by: user.id })
      .eq("id", existing.id)
      .select("id, email, role, token, expires_at, created_at")
      .maybeSingle();
    if (error || !data) return { ok: false, error: "db_error", message: error?.message ?? "Invite failed" };
    const r = data as Row;
    invite = { id: String(r.id), email, role, expiresAt, createdAt: String(r.created_at ?? ""), token };
  } else {
    const { data, error } = await supabase
      .from("investor_organisation_invites")
      .insert({ org_id: team.org.id, email, role, token, invited_by: user.id, expires_at: expiresAt })
      .select("id, email, role, token, expires_at, created_at")
      .maybeSingle();
    if (error || !data) {
      if (isMissingRelation(error)) return { ok: false, error: "unavailable", message: "Seat invites are not available yet (migration 0403 pending)" };
      return { ok: false, error: "db_error", message: error?.message ?? "Invite failed" };
    }
    const r = data as Row;
    invite = { id: String(r.id), email, role, expiresAt, createdAt: String(r.created_at ?? ""), token };
  }

  const inviteUrl = inviteUrlForToken(token);
  let emailSent = false;
  try {
    const { subject, html } = buildSeatInviteEmail({ inviterName: user.displayName?.trim() || user.email, orgName: team.org.name, inviteUrl, expiresDays: INVITE_TTL_DAYS });
    const { unsubscribeUrl, footerHtml } = await complianceFooter(email);
    const sent = await sendEmail({ to: email, subject, html: html + footerHtml, unsubscribeUrl });
    emailSent = sent.ok;
  } catch (err) {
    console.error("[blockid:organisations] invite email failed", err);
  }
  void appendAudit({
    user_id: user.id,
    actor: "user",
    action: "org.seat_invited",
    resource_type: "investor_organisation",
    resource_id: team.org.id,
    detail: { invite_id: invite.id, role, resend: !!existing, seats_used: team.seats.used + (existing ? 0 : 1), seats_limit: team.seats.unlimited ? null : team.seats.limit },
  }).catch(() => {});
  const used = team.seats.used + (existing ? 0 : 1);
  return {
    ok: true,
    invite,
    inviteUrl,
    emailSent,
    seats: { ...team.seats, used, remaining: team.seats.unlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, team.seats.limit - used) },
  };
}

// ─── Accept ──────────────────────────────────────────────────────────────────

export type AcceptError = "unavailable" | "not_found" | "expired" | "email_mismatch" | "db_error";
export type AcceptResult = { ok: true; org: InvestorOrganisation; alreadyMember: boolean } | { ok: false; error: AcceptError; message: string };

/** The signed-in user whose email matches the invite becomes a seat (idempotent). */
export async function acceptInvite(user: { id: string; email: string }, token: string): Promise<AcceptResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "unavailable", message: "Service unavailable" };
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return { ok: false, error: "not_found", message: "Invite not found" };
  const { data, error } = await supabase
    .from("investor_organisation_invites")
    .select("id, org_id, email, role, expires_at, accepted_at, revoked_at, investor_organisations:org_id (id, slug, name, kind, owner_user_id, is_personal)")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return { ok: false, error: "unavailable", message: "Seat invites are not available yet" };
    return { ok: false, error: "db_error", message: error.message ?? "Lookup failed" };
  }
  const raw = data as (Row & { investor_organisations?: Row | Row[] | null }) | null;
  if (!raw || raw.revoked_at) return { ok: false, error: "not_found", message: "Invite not found" };
  const o = (Array.isArray(raw.investor_organisations) ? raw.investor_organisations[0] : raw.investor_organisations) ?? null;
  if (!o) return { ok: false, error: "not_found", message: "Invite not found" };
  const org = orgFromRow(o);
  if (String(raw.email ?? "").toLowerCase() !== user.email.toLowerCase()) {
    return { ok: false, error: "email_mismatch", message: `This invite was sent to ${String(raw.email)}. Sign in with that address to accept it.` };
  }
  if (raw.accepted_at) return { ok: true, org, alreadyMember: true };
  if (String(raw.expires_at ?? "") < new Date().toISOString()) return { ok: false, error: "expired", message: "This invite has expired — ask the organisation owner to send a new one." };

  const { error: memErr } = await supabase
    .from("investor_organisation_members")
    .upsert({ org_id: org.id, user_id: user.id, role: String(raw.role ?? "investment_partner") }, { onConflict: "org_id,user_id" });
  if (memErr) return { ok: false, error: "db_error", message: memErr.message ?? "Could not add the seat" };
  await supabase.from("investor_organisation_invites").update({ accepted_at: new Date().toISOString(), accepted_by: user.id }).eq("id", raw.id);
  void appendAudit({
    user_id: user.id,
    actor: "user",
    action: "org.seat_accepted",
    resource_type: "investor_organisation",
    resource_id: org.id,
    detail: { invite_id: String(raw.id), role: String(raw.role ?? "investment_partner") },
  }).catch(() => {});
  return { ok: true, org, alreadyMember: false };
}

/** Owner removes a seat (never themselves) or revokes an open invite. */
export async function removeSeat(user: { id: string; plan: string | null }, target: { memberId?: string; inviteId?: string }): Promise<{ ok: true } | { ok: false; error: "unavailable" | "not_owner" | "not_found" | "db_error"; message: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "unavailable", message: "Service unavailable" };
  const team = await getTeam(user);
  if (!team.available || !team.org) return { ok: false, error: "unavailable", message: "Seats are not available yet" };
  if (!team.isOwner) return { ok: false, error: "not_owner", message: "Only the organisation owner can remove seats" };
  if (target.memberId) {
    const m = team.members.find((x) => x.id === target.memberId);
    if (!m || m.isOwner) return { ok: false, error: "not_found", message: "Seat not found" };
    const { error } = await supabase.from("investor_organisation_members").delete().eq("id", m.id).eq("org_id", team.org.id);
    if (error) return { ok: false, error: "db_error", message: error.message ?? "Remove failed" };
    void appendAudit({ user_id: user.id, actor: "user", action: "org.seat_removed", resource_type: "investor_organisation", resource_id: team.org.id, detail: { member_id: m.id } }).catch(() => {});
    return { ok: true };
  }
  if (target.inviteId) {
    const inv = team.invites.find((x) => x.id === target.inviteId);
    if (!inv) return { ok: false, error: "not_found", message: "Invite not found" };
    const { error } = await supabase.from("investor_organisation_invites").update({ revoked_at: new Date().toISOString() }).eq("id", inv.id).eq("org_id", team.org.id);
    if (error) return { ok: false, error: "db_error", message: error.message ?? "Revoke failed" };
    void appendAudit({ user_id: user.id, actor: "user", action: "org.seat_invite_revoked", resource_type: "investor_organisation", resource_id: team.org.id, detail: { invite_id: inv.id } }).catch(() => {});
    return { ok: true };
  }
  return { ok: false, error: "not_found", message: "Nothing to remove" };
}

// ─── Consensus (Appendix 2 — computed, never stored) ────────────────────────

export interface SeatAssessmentRow {
  userId: string;
  displayName: string;
  isMe: boolean;
  /** null = this seat has not started an assessment. */
  assessment: SeatVisibleAssessment | null;
}

export interface DossierConsensus {
  /** false = 0393 not applied / no org — the block renders its empty state. */
  available: boolean;
  orgId: string | null;
  orgName: string | null;
  seats: SeatAssessmentRow[];
  seatCount: number;
  submittedCount: number;
  /** Median rating per dimension over SUBMITTED rows (null when no seat rated it). */
  medianRating: Record<AssessmentDimKey, number | null>;
  /** Dimensions where seat ratings span ≥ 2 ("Discuss"). */
  disagreement: AssessmentDimKey[];
  tally: Record<AssessmentDecision, number>;
  /** Majority decision over submitted rows; "split" on a tie; null with no submission. */
  aggregate: AssessmentDecision | "split" | null;
  meanConviction: number | null;
  /** "Firm consensus (2/3)" — submitted / seats. */
  label: string;
}

export function emptyConsensus(available = false): DossierConsensus {
  return {
    available,
    orgId: null,
    orgName: null,
    seats: [],
    seatCount: 0,
    submittedCount: 0,
    medianRating: Object.fromEntries(ASSESSMENT_DIM_KEYS.map((k) => [k, null])) as Record<AssessmentDimKey, number | null>,
    disagreement: [],
    tally: { pass: 0, track: 0, proceed: 0 },
    aggregate: null,
    meanConviction: null,
    label: "",
  };
}

function median(xs: number[]): number | null {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Pure: the Appendix-2 consensus over the seats' CURRENT assessments.
 * `seats` carries every seat (assessment null when none); only rows with
 * status "submitted" enter the medians, tally and disagreement set.
 */
export function computeConsensus(seats: SeatAssessmentRow[], org: { id: string; name: string } | null): DossierConsensus {
  const out = emptyConsensus(true);
  out.orgId = org?.id ?? null;
  out.orgName = org?.name ?? null;
  out.seats = seats;
  out.seatCount = seats.length;
  const submitted = seats.map((s) => s.assessment).filter((a): a is SeatVisibleAssessment => !!a && a.status === "submitted");
  out.submittedCount = submitted.length;
  for (const k of ASSESSMENT_DIM_KEYS) {
    const ratings = submitted.map((a) => a.dimensionRatings[k]?.rating).filter((r): r is 1 | 2 | 3 | 4 | 5 => typeof r === "number");
    out.medianRating[k] = median(ratings);
    if (ratings.length >= 2 && Math.max(...ratings) - Math.min(...ratings) >= 2) out.disagreement.push(k);
  }
  for (const a of submitted) if (a.decision) out.tally[a.decision] += 1;
  const convictions = submitted.map((a) => a.conviction).filter((c): c is number => typeof c === "number");
  out.meanConviction = convictions.length ? Math.round((convictions.reduce((s, c) => s + c, 0) / convictions.length) * 10) / 10 : null;
  if (submitted.length) {
    const best = Math.max(out.tally.pass, out.tally.track, out.tally.proceed);
    const winners = (Object.keys(out.tally) as AssessmentDecision[]).filter((d) => out.tally[d] === best && best > 0);
    out.aggregate = winners.length === 1 ? winners[0] : "split";
  }
  out.label = `${org?.name ? "Firm" : "Seat"} consensus (${out.submittedCount}/${out.seatCount})`;
  return out;
}

/**
 * Every seat's current assessment on one evaluation, masked for the viewer
 * (own row in full, other seats without private_notes). The caller has
 * already proven the viewer may open the evaluation.
 */
export async function readConsensus(input: { evaluationId: string; viewerUserId: string; viewerAssessment?: EvaluationAssessment | null }): Promise<DossierConsensus> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return emptyConsensus(false);
  const org = await resolveActingOrg(input.viewerUserId);
  if (!org) return emptyConsensus(false);
  const seatIds = await listSeatUserIds(org.id);
  const ids = seatIds.includes(input.viewerUserId) ? seatIds : [input.viewerUserId, ...seatIds];
  // Personal org with a single seat: the consensus is just "my view" — still
  // returned so the header can print "(1/1)" once submitted.
  const [rowsRes, usersRes] = await Promise.all([
    supabase.from("evaluation_assessments").select(ASSESSMENT_COLUMNS).eq("evaluation_id", input.evaluationId).in("assessor_user_id", ids).order("version", { ascending: false }).limit(200),
    supabase.from("app_users").select("id, display_name, email").in("id", ids).limit(200),
  ]);
  if (rowsRes.error) {
    if (!isMissingRelation(rowsRes.error)) console.error("[blockid:organisations] consensus read failed", rowsRes.error);
    return emptyConsensus(false);
  }
  const latest = new Map<string, EvaluationAssessment>();
  for (const r of (rowsRes.data ?? []) as Row[]) {
    const a = mapAssessmentRow(r);
    if (!latest.has(a.assessorUserId)) latest.set(a.assessorUserId, a);
  }
  if (input.viewerAssessment) latest.set(input.viewerUserId, input.viewerAssessment);
  const names = new Map<string, string>();
  for (const u of ((usersRes.data ?? []) as Row[])) {
    names.set(String(u.id), String(u.display_name ?? "").trim() || String(u.email ?? "").split("@")[0] || "Seat");
  }
  const seats: SeatAssessmentRow[] = ids.map((uid) => {
    const a = latest.get(uid) ?? null;
    return { userId: uid, displayName: uid === input.viewerUserId ? "Me" : (names.get(uid) ?? "Seat"), isMe: uid === input.viewerUserId, assessment: a ? toSeatVisible(a) : null };
  });
  return computeConsensus(seats, { id: org.id, name: org.name });
}
