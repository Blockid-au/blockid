// Investor Dossier — block 6 actions + the founder-side intro (G13-W5-D3,
// S-D3; BA spec §A.3 block 6, §A.5 E3.6 / E2.6, §C.2).
//
//   addProjectToWatchlist   `watchlist` is ticker-keyed (0066) and the
//                           dossier is project-keyed: the row is written with
//                           BOTH — the listing's ticker when the project has
//                           one, else a deterministic `PRJ-<8 hex>` so the
//                           UNIQUE (account_id, ticker) still holds — and
//                           `watchlist.project_id` (0392) so the row deep-links
//                           the dossier.
//   markInvested            `investor_portfolio` (0314) write UI: one row per
//                           (investor, project) — `startup_id` keeps the text
//                           id the older readers expect, `project_id` (0403)
//                           is the FK.
//   requestIntro            Scout → mailto (kept). Firm / Program on a
//                           founder-claimed row at ≥ reports_shared → an
//                           `investor_contacts` row on the FOUNDER's project
//                           (type from the plan, stage "contacted", source
//                           "dossier_intro") + a `intro_requested`
//                           notification to the founder. The founder's CRM
//                           shows the inbound; nothing is emailed by us.
//   requestAccess           attributed_only → "invite founder to share
//                           reports" is the existing claim flow (invite
//                           token); reports_shared → "request data-room
//                           access" notifies the founder (`access_requested`).
//   requestIntroToInvestor  E2.6 founder side: "Investors who match" →
//                           Request intro writes `investor_contacts` on the
//                           founder's own project (the investor as a CRM
//                           contact) and notifies the INVESTOR
//                           (`intro_requested`, founder_notifications works
//                           for any app user — the bell is in the shared
//                           nav). The investor's email never reaches the
//                           founder card (InvestorMatch carries none).
//
// Every write is audited through appendAudit (§C.2) with ids only.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { appendAudit } from "@/lib/audit";
import { insertNotification } from "@/lib/notifications";
import { planIdToTier } from "@/lib/segments";
import { TIER_RANK, type MentorAccessTier } from "@/lib/mentor/access-tiers";
import type { Evaluation } from "@/lib/evaluations";

type Row = Record<string, unknown>;

const uuidRe = /^[0-9a-f-]{36}$/i;

// ─── Watchlist ───────────────────────────────────────────────────────────────

/** Deterministic synthetic ticker for a project with no listing — matches the API's `/^[A-Z]{1,8}-[A-Z0-9]{1,8}$/`. */
export function syntheticTicker(projectId: string): string {
  return `PRJ-${projectId.replace(/-/g, "").slice(0, 8).toUpperCase() || "00000000"}`;
}

export type WatchlistActionResult = { ok: true; added: boolean; ticker: string } | { ok: false; error: "unavailable" | "db_error"; message: string };

export async function addProjectToWatchlist(input: { userId: string; projectId: string; projectSlug: string | null; evaluationId: string }): Promise<WatchlistActionResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "unavailable", message: "Service unavailable" };
  try {
    const { data: existing } = await supabase.from("watchlist").select("id, ticker").eq("account_id", input.userId).eq("project_id", input.projectId).limit(1).maybeSingle();
    if (existing) return { ok: true, added: false, ticker: String((existing as Row).ticker ?? "") };
  } catch {
    /* 0392 project_id not applied — fall through to the ticker path */
  }
  // Real ticker when the founder listed the startup (0392 backfill logic: ticker ↔ projects.user_id).
  let ticker = syntheticTicker(input.projectId);
  try {
    const { data: proj } = await supabase.from("projects").select("user_id").eq("id", input.projectId).maybeSingle();
    const ownerId = (proj as Row | null)?.user_id;
    if (ownerId) {
      const { data: listing } = await supabase.from("startup_listings").select("ticker").eq("startup_id", String(ownerId)).limit(1).maybeSingle();
      const t = (listing as Row | null)?.ticker;
      if (typeof t === "string" && /^[A-Z]{1,8}-[A-Z0-9]{1,8}$/.test(t)) ticker = t;
    }
  } catch {
    /* listings unavailable — synthetic ticker */
  }
  const { data: byTicker } = await supabase.from("watchlist").select("id, project_id").eq("account_id", input.userId).eq("ticker", ticker).maybeSingle();
  if (byTicker) {
    const r = byTicker as Row;
    if (!r.project_id) await supabase.from("watchlist").update({ project_id: input.projectId }).eq("id", String(r.id));
    return { ok: true, added: false, ticker };
  }
  const { error } = await supabase.from("watchlist").insert({ account_id: input.userId, ticker, slug: input.projectSlug ?? null, project_id: input.projectId, notes: "#tag:following" });
  if (error) {
    console.error("[blockid:investor-actions] watchlist insert failed", error);
    return { ok: false, error: "db_error", message: error.message ?? "Could not add to watchlist" };
  }
  void appendAudit({ user_id: input.userId, actor: "user", action: "dossier.watchlisted", resource_type: "evaluation", resource_id: input.evaluationId, detail: { project_id: input.projectId, ticker } }).catch(() => {});
  return { ok: true, added: true, ticker };
}

// ─── Portfolio ───────────────────────────────────────────────────────────────

export interface MarkInvestedInput {
  userId: string;
  projectId: string;
  projectName: string;
  evaluationId: string;
  valuationAud?: number | null;
  ownershipPct?: number | null;
  investedAt?: string | null;
  notes?: string | null;
}

export type PortfolioActionResult = { ok: true; id: string; created: boolean } | { ok: false; error: "unavailable" | "db_error" | "invalid_input"; message: string };

export async function markInvested(input: MarkInvestedInput): Promise<PortfolioActionResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "unavailable", message: "Service unavailable" };
  if (input.ownershipPct != null && (input.ownershipPct < 0 || input.ownershipPct > 100)) return { ok: false, error: "invalid_input", message: "Ownership must be 0–100 %" };
  if (input.valuationAud != null && input.valuationAud < 0) return { ok: false, error: "invalid_input", message: "Valuation must be ≥ 0" };
  const patch: Row = {
    company_name: input.projectName.slice(0, 200),
    valuation_aud: input.valuationAud ?? null,
    ownership_pct: input.ownershipPct ?? null,
    notes: input.notes ? input.notes.slice(0, 2000) : null,
    ...(input.investedAt ? { invested_at: input.investedAt } : {}),
  };
  const { data: existing } = await supabase.from("investor_portfolio").select("id").eq("investor_user_id", input.userId).eq("startup_id", input.projectId).maybeSingle();
  let id: string;
  let created = false;
  if (existing) {
    id = String((existing as Row).id);
    const { error } = await supabase.from("investor_portfolio").update(patch).eq("id", id);
    if (error) return { ok: false, error: "db_error", message: error.message ?? "Update failed" };
  } else {
    let res = await supabase.from("investor_portfolio").insert({ investor_user_id: input.userId, startup_id: input.projectId, project_id: input.projectId, ...patch }).select("id").maybeSingle();
    if (res.error && /project_id/.test(res.error.message ?? "")) {
      // 0403 not applied yet — write without the FK column.
      res = await supabase.from("investor_portfolio").insert({ investor_user_id: input.userId, startup_id: input.projectId, ...patch }).select("id").maybeSingle();
    }
    if (res.error || !res.data) {
      console.error("[blockid:investor-actions] portfolio insert failed", res.error);
      return { ok: false, error: "db_error", message: res.error?.message ?? "Could not record the investment" };
    }
    id = String((res.data as Row).id);
    created = true;
  }
  void appendAudit({
    user_id: input.userId,
    actor: "user",
    action: "portfolio.marked_invested",
    resource_type: "evaluation",
    resource_id: input.evaluationId,
    detail: { project_id: input.projectId, portfolio_id: id, created, has_valuation: input.valuationAud != null, has_ownership: input.ownershipPct != null },
  }).catch(() => {});
  return { ok: true, id, created };
}

// ─── Intro (evaluator → founder) ─────────────────────────────────────────────

/** CRM contact type for an evaluator plan (investor_contacts.type CHECK). */
export function contactTypeForPlan(planId: string | null | undefined, accountType?: string | null): "angel" | "vc" | "family_office" | "accelerator" | "advisor" | "other" {
  const tier = planIdToTier(planId);
  if (tier === "angel") return "angel";
  if (tier === "advisor") return "advisor";
  if (tier === "vc_small" || tier === "vc_ent") return "vc";
  if (tier === "accel_starter" || tier === "accel_growth" || tier === "accel_ent") return "accelerator";
  if (accountType === "investor_angel") return "angel";
  if (accountType === "investor_vc") return "vc";
  if (accountType === "accelerator") return "accelerator";
  if (accountType === "advisor" || accountType === "service_provider") return "advisor";
  return "other";
}

/** Scout keeps mailto (§A.3 block 6); Firm and above write the CRM row. */
export function introChannelFor(planId: string | null | undefined): "mailto" | "crm" {
  const tier = planIdToTier(planId);
  return tier === "angel" || tier === "free" || tier === "starter" || tier === "growth" ? "mailto" : "crm";
}

export function introMailto(founderEmail: string | null, startupName: string, investorName: string): string | null {
  if (!founderEmail) return null;
  const subject = `Intro request via BlockID — ${startupName}`;
  const body = `Hi,\n\n${investorName} reviewed ${startupName}'s Investor Dossier on BlockID.au and would like an introduction.\n\n`;
  return `mailto:${encodeURIComponent(founderEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export interface RequestIntroInput {
  investor: { id: string; email: string; displayName: string | null; plan: string | null; accountType?: string | null; orgName?: string | null };
  evaluation: Pick<Evaluation, "id" | "projectId" | "founderUserId" | "founderEmail" | "ownerKind" | "claimedAt" | "consentTier">;
  startupName: string;
}

export type RequestIntroResult =
  | { ok: true; channel: "mailto"; href: string }
  | { ok: true; channel: "crm"; contactId: string; created: boolean; notified: boolean }
  | { ok: false; error: "unavailable" | "no_founder" | "consent_too_low" | "db_error"; message: string; href?: string | null };

/** The founder's own active project (the row their CRM lives on); null when they have none. */
export async function founderProjectId(founderUserId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !founderUserId) return null;
  try {
    const { data } = await supabase.from("projects").select("id, is_default, created_at").eq("user_id", founderUserId).is("archived_at", null).order("is_default", { ascending: false }).order("created_at", { ascending: true }).limit(1).maybeSingle();
    return data ? String((data as Row).id) : null;
  } catch {
    return null;
  }
}

async function upsertCrmContact(input: {
  projectId: string;
  name: string;
  email: string | null;
  org: string | null;
  role: string | null;
  type: ReturnType<typeof contactTypeForPlan>;
  source: string;
  tags: string[];
  createdBy: string;
  nextStep: string;
}): Promise<{ ok: true; id: string; created: boolean } | { ok: false; message: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, message: "Service unavailable" };
  const email = input.email ? input.email.toLowerCase() : null;
  if (email) {
    const { data: existing } = await supabase.from("investor_contacts").select("id").eq("project_id", input.projectId).eq("email", email).maybeSingle();
    if (existing) {
      const id = String((existing as Row).id);
      await supabase.from("investor_contacts").update({ last_touch_at: new Date().toISOString(), archived_at: null, next_step: input.nextStep }).eq("id", id);
      return { ok: true, id, created: false };
    }
  }
  const { data, error } = await supabase
    .from("investor_contacts")
    .insert({
      project_id: input.projectId,
      name: input.name.slice(0, 120),
      email,
      org: input.org ? input.org.slice(0, 120) : null,
      role: input.role,
      type: input.type,
      stage: "contacted",
      source: input.source,
      tags: input.tags,
      last_touch_at: new Date().toISOString(),
      next_step: input.nextStep,
      created_by: input.createdBy,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, message: error?.message ?? "Could not write the CRM contact" };
  return { ok: true, id: String((data as Row).id), created: true };
}

export async function requestIntro(input: RequestIntroInput): Promise<RequestIntroResult> {
  const investorName = input.investor.displayName?.trim() || input.investor.email;
  const channel = introChannelFor(input.investor.plan);
  const href = introMailto(input.evaluation.founderEmail, input.startupName, investorName);
  const claimed = input.evaluation.ownerKind === "founder_claimed" && !!input.evaluation.claimedAt && !!input.evaluation.founderUserId;
  const audit = (detail: Record<string, unknown>) =>
    void appendAudit({ user_id: input.investor.id, actor: "user", action: "intro.requested", resource_type: "evaluation", resource_id: input.evaluation.id, detail: { project_id: input.evaluation.projectId, ...detail } }).catch(() => {});

  if (channel === "mailto" || !claimed) {
    if (!href) return { ok: false, error: "no_founder", message: "No founder email on this evaluation — invite the founder first.", href: null };
    audit({ channel: "mailto" });
    return { ok: true, channel: "mailto", href };
  }
  if (TIER_RANK[input.evaluation.consentTier as MentorAccessTier] < TIER_RANK.reports_shared) {
    return { ok: false, error: "consent_too_low", message: "The founder has not shared reports yet — ask for the Reports shared tier first.", href };
  }
  const projectId = await founderProjectId(input.evaluation.founderUserId as string);
  if (!projectId) {
    if (!href) return { ok: false, error: "no_founder", message: "The founder has no startup profile to receive the intro yet.", href: null };
    audit({ channel: "mailto", reason: "founder_has_no_project" });
    return { ok: true, channel: "mailto", href };
  }
  const contact = await upsertCrmContact({
    projectId,
    name: investorName,
    email: input.investor.email,
    org: input.investor.orgName ?? null,
    role: null,
    type: contactTypeForPlan(input.investor.plan, input.investor.accountType),
    source: "dossier_intro",
    tags: ["inbound", "dossier"],
    createdBy: input.investor.id,
    nextStep: `Reply to ${investorName}'s intro request from your Investor Dossier`,
  });
  if (!contact.ok) return { ok: false, error: "db_error", message: contact.message, href };
  const notified = await insertNotification({
    userId: input.evaluation.founderUserId as string,
    projectId,
    kind: "intro_requested",
    payload: { direction: "to_founder", investor: investorName, org: input.investor.orgName ?? null, contact_id: contact.id, evaluation_id: input.evaluation.id, startup: input.startupName },
    dedupeKey: `intro:${input.evaluation.id}:${input.investor.id}`,
    throttleMs: 24 * 60 * 60 * 1000,
  });
  audit({ channel: "crm", contact_id: contact.id, created: contact.created, notified });
  return { ok: true, channel: "crm", contactId: contact.id, created: contact.created, notified };
}

// ─── Request access upgrade (block 3 CTA) ────────────────────────────────────

export type RequestAccessResult =
  | { ok: true; mode: "invite"; claimUrl: string | null }
  | { ok: true; mode: "notified"; requested: MentorAccessTier; notified: boolean }
  | { ok: false; error: "already_full" | "no_founder" | "unavailable"; message: string };

export async function requestAccess(input: {
  investor: { id: string; email: string; displayName: string | null };
  evaluation: Pick<Evaluation, "id" | "projectId" | "founderUserId" | "founderEmail" | "ownerKind" | "claimedAt" | "consentTier" | "inviteToken">;
  startupName: string;
  claimUrl: string | null;
}): Promise<RequestAccessResult> {
  const tier = input.evaluation.consentTier as MentorAccessTier;
  if (tier === "full_mentor") return { ok: false, error: "already_full", message: "You already have the full-mentor tier." };
  const investorName = input.investor.displayName?.trim() || input.investor.email;
  const claimed = input.evaluation.ownerKind === "founder_claimed" && !!input.evaluation.claimedAt && !!input.evaluation.founderUserId;
  if (!claimed) {
    // attributed_only, founder not yet claimed → the existing invite / claim flow.
    void appendAudit({ user_id: input.investor.id, actor: "user", action: "consent.requested", resource_type: "evaluation", resource_id: input.evaluation.id, detail: { project_id: input.evaluation.projectId, tier: "reports_shared", mode: "invite", has_token: !!input.evaluation.inviteToken } }).catch(() => {});
    return { ok: true, mode: "invite", claimUrl: input.claimUrl };
  }
  const requested: MentorAccessTier = tier === "attributed_only" ? "reports_shared" : "full_mentor";
  const notified = await insertNotification({
    userId: input.evaluation.founderUserId as string,
    projectId: null,
    kind: "access_requested",
    payload: { investor: investorName, requested, evaluation_id: input.evaluation.id, startup: input.startupName },
    dedupeKey: `access:${input.evaluation.id}:${input.investor.id}:${requested}`,
    throttleMs: 24 * 60 * 60 * 1000,
  });
  void appendAudit({ user_id: input.investor.id, actor: "user", action: "consent.requested", resource_type: "evaluation", resource_id: input.evaluation.id, detail: { project_id: input.evaluation.projectId, tier: requested, mode: "notified", notified } }).catch(() => {});
  return { ok: true, mode: "notified", requested, notified };
}

// ─── E2.6 — founder requests an intro to a matched investor ─────────────────

export interface FounderIntroInput {
  founder: { id: string; email: string; displayName: string | null };
  projectId: string;
  startupName: string;
  investor: { id: string; name: string; firm: string | null; plan: string | null; mandateId?: string | null };
}

export type FounderIntroResult = { ok: true; contactId: string; created: boolean; notified: boolean } | { ok: false; error: "unavailable" | "invalid_input" | "db_error"; message: string };

export async function requestIntroToInvestor(input: FounderIntroInput): Promise<FounderIntroResult> {
  if (!uuidRe.test(input.investor.id) || !uuidRe.test(input.projectId)) return { ok: false, error: "invalid_input", message: "Unknown investor" };
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "unavailable", message: "Service unavailable" };
  // The investor's email is looked up server-side for the CRM row only — the
  // founder card never carried it (InvestorMatch has no email field).
  let investorEmail: string | null = null;
  try {
    const { data } = await supabase.from("app_users").select("email").eq("id", input.investor.id).maybeSingle();
    investorEmail = (data as Row | null)?.email ? String((data as Row).email) : null;
  } catch {
    /* no email → contact without one */
  }
  const contact = await upsertCrmContact({
    projectId: input.projectId,
    name: input.investor.name.slice(0, 120),
    email: investorEmail,
    org: input.investor.firm,
    role: null,
    type: contactTypeForPlan(input.investor.plan),
    source: "investor_match",
    tags: ["match", ...(input.investor.mandateId ? ["mandate"] : [])],
    createdBy: input.founder.id,
    nextStep: "Wait for the investor to accept the intro, then send your one-pager",
  });
  if (!contact.ok) return { ok: false, error: "db_error", message: contact.message };
  const founderName = input.founder.displayName?.trim() || input.founder.email;
  const notified = await insertNotification({
    userId: input.investor.id,
    projectId: null,
    kind: "intro_requested",
    payload: { direction: "to_investor", founder: founderName, startup: input.startupName, project_id: input.projectId, mandate_id: input.investor.mandateId ?? null },
    dedupeKey: `intro:${input.projectId}:${input.investor.id}`,
    throttleMs: 24 * 60 * 60 * 1000,
  });
  void appendAudit({
    user_id: input.founder.id,
    actor: "user",
    action: "intro.requested",
    resource_type: "project",
    resource_id: input.projectId,
    detail: { channel: "crm", investor_id: input.investor.id, mandate_id: input.investor.mandateId ?? null, contact_id: contact.id, created: contact.created, notified },
  }).catch(() => {});
  return { ok: true, contactId: contact.id, created: contact.created, notified };
}
