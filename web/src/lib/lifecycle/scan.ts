// G34-BT4 — the lifecycle scan: finds who is due for a behaviour-triggered
// flow and queues their rows on `email_drips` (plan §9.2). The drip worker
// (api/cron/email-drip) then sends them through the one gate: preference,
// consent, suppression, frequency cap, quiet hours and the flow's stop
// condition (lib/lifecycle/stop-conditions.ts).
//
//   flow       trigger (read here)                                   rows queued
//   ---------  ----------------------------------------------------  -------------------------------------------
//   evidence   svi_analyses 48 h–10 d old, 0 svi_evidence on the      evidence_gap_1 now, evidence_gap_2 at +7 d
//              account (EM14)
//   intake     onboarding started, not completed, idle ≥ 24 h (EM13) intake_abandoned_1, _2 ≥ 74 h later
//   rerun      svi_evidence ≥ 24 h old, newer than the last full     rerun_prompt
//              analysis (EM15)
//   quota      2nd free report delivered 3–10 d ago, no purchase     free_quota_used
//              (EM16)
//   sunset     no sign-in for 90 d (sessions.last_used_at, DC08,      sunset_check; 30 d after it, with no sign-in
//              then app_users.last_login_at) (EM20)                  or saved preference → commercial categories off
//   digest     monthly, active account holders (EM19)                monthly_digest (quiet months included)
//
// Every C-class candidate is pre-checked for consent and the flow's
// preference category so a dry run lists real recipients and the queue is
// not filled with rows the worker would only cancel. `dry` reads everything
// and writes nothing.

import "server-only";
import { hasCommercialConsent } from "@/lib/email-sends";
import { getEmailPreferences } from "@/lib/email-preferences";
import { buildEvidenceChecklist } from "@/lib/svi/evidence-checklist";
import { DIMENSION_OWNERS, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import { stepsForFlow, flowForPersona, isWizardPersona, WIZARD_TOTAL_STEPS } from "@/lib/onboarding/flow";
import { mayShowPercentile } from "@/lib/benchmarks/publication-rules";
import { LIFECYCLE_META, type LifecycleCampaign } from "./campaigns";
import { insertLifecycleDrips, normaliseRecipient, type LifecycleDb, type LifecycleRow } from "./enqueue";
import { hasPurchased } from "./stop-conditions";
import { nextCommercialSendSlot, spacedSlot } from "./send-window";
import type { DigestMissingItem, EvidenceGapData, IntakeAbandonedData, MonthlyDigestData } from "./payload";
import { SUNSET_GRACE_DAYS } from "./templates";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Candidates read per flow per run — bounds one tick. */
export const SCAN_LIMIT = 300;

export const SCAN_FLOWS = ["evidence", "intake", "rerun", "quota", "sunset", "digest"] as const;
export type ScanFlow = (typeof SCAN_FLOWS)[number];
/** The daily run; the monthly digest has its own cron line (`?flows=digest`). */
export const DAILY_SCAN_FLOWS: readonly ScanFlow[] = ["evidence", "intake", "rerun", "quota", "sunset"];

export function parseScanFlows(raw: string | null | undefined): ScanFlow[] {
  if (!raw) return [...DAILY_SCAN_FLOWS];
  const want = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return SCAN_FLOWS.filter((f) => want.includes(f));
}

export interface ScanFlowResult {
  flow: ScanFlow;
  candidates: number;
  /** `campaign:email` — queued (or, in a dry run, would be queued). */
  queued: string[];
  /** Sunset only: `email` whose commercial categories were (would be) switched off. */
  sunsetOff?: string[];
  skipped: Record<string, number>;
  error?: string;
}

export interface ScanContext {
  db: LifecycleDb;
  now: Date;
  dry: boolean;
}

function bump(r: ScanFlowResult, reason: string): void {
  r.skipped[reason] = (r.skipped[reason] ?? 0) + 1;
}

async function rows<T>(q: PromiseLike<{ data: unknown; error: { message?: string } | null }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new Error(error.message ?? "query failed");
  return (Array.isArray(data) ? data : []) as T[];
}

/** Consent + the flow's preference category + the unsubscribe token. */
export async function commercialEligibility(
  email: string,
  campaign: LifecycleCampaign,
): Promise<{ ok: true; token: string | null } | { ok: false; reason: string }> {
  const prefs = await getEmailPreferences(email);
  if (prefs?.unsubscribed_all) return { ok: false, reason: "unsubscribed" };
  const cat = LIFECYCLE_META[campaign].category;
  if (prefs && cat !== "payment_receipts" && cat !== "money_radar" && prefs[cat] !== true) return { ok: false, reason: `category_off:${cat}` };
  if (!(await hasCommercialConsent(email))) return { ok: false, reason: "no_consent" };
  return { ok: true, token: prefs?.unsubscribe_token ?? null };
}

async function queue(ctx: ScanContext, r: ScanFlowResult, batch: LifecycleRow[], opts: Parameters<typeof insertLifecycleDrips>[2]): Promise<void> {
  if (batch.length === 0) return;
  if (ctx.dry) {
    // Dedupe still applies in a dry run — read-only.
    const first = batch[0];
    const email = normaliseRecipient(first.email);
    if (!email) return bump(r, "invalid_email");
    let q = ctx.db
      .from("email_drips")
      .select("id")
      .eq("email", email)
      .eq("campaign", first.campaign)
      .gt("created_at", new Date(ctx.now.getTime() - opts.dedupeDays * DAY_MS).toISOString());
    if (opts.dedupeKey) q = q.eq(opts.dedupeKey.path, opts.dedupeKey.value);
    const existing = await rows<{ id: string }>(q.limit(1));
    if (existing.length > 0) return bump(r, "duplicate");
    for (const b of batch) r.queued.push(`${b.campaign}:${email}`);
    return;
  }
  const res = await insertLifecycleDrips(ctx.db, batch, { ...opts, now: ctx.now });
  if (res === "queued") for (const b of batch) r.queued.push(`${b.campaign}:${b.email}`);
  else bump(r, res);
}

async function userIdByEmail(db: LifecycleDb, email: string): Promise<string | null> {
  const found = await rows<{ id: string }>(db.from("app_users").select("id").eq("email", email).limit(1));
  return found[0]?.id ?? null;
}

// ── EM14 evidence gap ────────────────────────────────────────────────────────

interface AnalysisSub {
  key?: string;
  value?: number;
  assessed?: boolean;
}

/** Pure: the weakest scored dimension of an analysis_json and the evidence it is missing. */
export function buildEvidenceGapData(analysisJson: unknown, analysedAt: string): EvidenceGapData | null {
  const subs = ((analysisJson as { subs?: unknown } | null)?.subs ?? []) as AnalysisSub[];
  if (!Array.isArray(subs)) return null;
  const scored = subs.filter((s) => typeof s?.key === "string" && typeof s.value === "number" && s.key in DIMENSION_OWNERS);
  if (scored.length === 0) return null;
  const pool = scored.some((s) => s.assessed !== false) ? scored.filter((s) => s.assessed !== false) : scored;
  const weakest = pool.reduce((min, s) => ((s.value as number) < (min.value as number) ? s : min), pool[0]);
  const key = weakest.key as DimKey;
  const owner = DIMENSION_OWNERS[key];
  const row = buildEvidenceChecklist([]).find((c) => c.dimension === key);
  return {
    dimension_key: key,
    dimension_title: owner.title,
    short_label: owner.shortLabel,
    lead_agent: String(owner.primary).toUpperCase(),
    score: typeof weakest.value === "number" ? Math.round(weakest.value) : null,
    missing: (row?.missing ?? []).slice(0, 3).map((m) => m.label),
    missing_count: row?.missing.length ?? 0,
    confidence_to: row?.raise?.label ?? null,
    cta_path: row?.cta.href ?? `/workspace/evidence/gaps?dim=${key}`,
    analysed_at: analysedAt,
  };
}

async function scanEvidenceGap(ctx: ScanContext, r: ScanFlowResult): Promise<void> {
  const { db, now } = ctx;
  const analyses = await rows<{ email: string; project_id: string | null; created_at: string; viewed_at: string | null; analysis_json: unknown }>(
    db
      .from("svi_analyses")
      .select("email, project_id, created_at, viewed_at, analysis_json")
      .lte("created_at", new Date(now.getTime() - 48 * HOUR_MS).toISOString())
      .gte("created_at", new Date(now.getTime() - 10 * DAY_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(SCAN_LIMIT),
  );
  const seen = new Set<string>();
  for (const a of analyses) {
    const email = normaliseRecipient(a.email);
    if (!email) { bump(r, "excluded_email"); continue; }
    const k = `${email}|${a.project_id ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    r.candidates++;
    let acctQ = db.from("svi_accounts").select("id, startup_name").eq("email", a.email);
    acctQ = a.project_id ? acctQ.eq("project_id", a.project_id) : acctQ.is("project_id", null);
    const acct = (await rows<{ id: string; startup_name: string | null }>(acctQ.limit(1)))[0];
    if (!acct) { bump(r, "no_account"); continue; }
    const { count, error } = await db.from("svi_evidence").select("id", { count: "exact", head: true }).eq("account_id", acct.id);
    if (error) throw new Error(error.message ?? "svi_evidence count failed");
    if ((count ?? 0) > 0) { bump(r, "has_evidence"); continue; }
    const userId = await userIdByEmail(db, email);
    if (!userId) { bump(r, "no_user"); continue; }
    const gap = buildEvidenceGapData(a.analysis_json, a.created_at);
    if (!gap) { bump(r, "no_dimensions"); continue; }
    const elig = await commercialEligibility(email, "evidence_gap_1");
    if (!elig.ok) { bump(r, elig.reason); continue; }
    const first = nextCommercialSendSlot(now);
    const second = spacedSlot(new Date(Date.parse(a.viewed_at ?? a.created_at) + 7 * DAY_MS), first);
    const payload = { lifecycle: { gap }, project_id: a.project_id, startup: acct.startup_name, unsubscribe_token: elig.token };
    await queue(ctx, r, [
      { email, user_id: userId, campaign: "evidence_gap_1", scheduled_for: first.toISOString(), payload },
      { email, user_id: userId, campaign: "evidence_gap_2", scheduled_for: second.toISOString(), payload },
    ], { dedupeDays: 60 });
  }
}

// ── EM13 onboarding abandoned ────────────────────────────────────────────────

/** Pure: progress through the 3-step wizard from `onboarding_state`. */
export function intakeProgress(state: unknown, accountType: string | null | undefined): IntakeAbandonedData | null {
  const s = state as { step?: unknown; updated_at?: unknown } | null;
  if (!s || typeof s.updated_at !== "string") return null;
  const step = typeof s.step === "number" && Number.isFinite(s.step) ? Math.round(s.step) : 1;
  const total = WIZARD_TOTAL_STEPS;
  const done = Math.max(0, Math.min(total - 1, step - 1));
  const steps = stepsForFlow(flowForPersona(isWizardPersona(accountType) ? accountType : null));
  return { steps_done: done, steps_total: total, next_step_label: steps[done]?.label.en ?? "Your startup", idle_since: s.updated_at };
}

async function scanIntake(ctx: ScanContext, r: ScanFlowResult): Promise<void> {
  const { db, now } = ctx;
  const users = await rows<{ id: string; email: string; account_type: string | null; onboarding_state: unknown }>(
    db
      .from("app_users")
      .select("id, email, account_type, onboarding_state")
      .not("onboarding_completed", "is", true)
      .not("onboarding_state", "is", null)
      .gte("created_at", new Date(now.getTime() - 30 * DAY_MS).toISOString())
      .limit(SCAN_LIMIT),
  );
  for (const u of users) {
    const email = normaliseRecipient(u.email);
    if (!email) { bump(r, "excluded_email"); continue; }
    const prog = intakeProgress(u.onboarding_state, u.account_type);
    if (!prog) { bump(r, "no_state"); continue; }
    const idle = Date.parse(prog.idle_since);
    if (!Number.isFinite(idle) || now.getTime() - idle < 24 * HOUR_MS) { bump(r, "not_idle_yet"); continue; }
    if (now.getTime() - idle > 14 * DAY_MS) { bump(r, "idle_too_long"); continue; }
    r.candidates++;
    const elig = await commercialEligibility(email, "intake_abandoned_1");
    if (!elig.ok) { bump(r, elig.reason); continue; }
    const first = nextCommercialSendSlot(now);
    const second = spacedSlot(new Date(idle + 96 * HOUR_MS), first);
    const payload = { lifecycle: { intake: prog }, unsubscribe_token: elig.token };
    await queue(ctx, r, [
      { email, user_id: u.id, campaign: "intake_abandoned_1", scheduled_for: first.toISOString(), payload },
      { email, user_id: u.id, campaign: "intake_abandoned_2", scheduled_for: second.toISOString(), payload },
    ], { dedupeDays: 60 });
  }
}

// ── EM15 re-run prompt ───────────────────────────────────────────────────────

async function scanRerun(ctx: ScanContext, r: ScanFlowResult): Promise<void> {
  const { db, now } = ctx;
  const evidence = await rows<{ account_id: string; label: string | null; created_at: string }>(
    db
      .from("svi_evidence")
      .select("account_id, label, created_at")
      .lte("created_at", new Date(now.getTime() - 24 * HOUR_MS).toISOString())
      .gte("created_at", new Date(now.getTime() - 10 * DAY_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(SCAN_LIMIT * 3),
  );
  const byAccount = new Map<string, Array<{ label: string | null; created_at: string }>>();
  for (const e of evidence) (byAccount.get(e.account_id) ?? byAccount.set(e.account_id, []).get(e.account_id)!).push(e);
  for (const [accountId, items] of [...byAccount].slice(0, SCAN_LIMIT)) {
    r.candidates++;
    const acct = (await rows<{ email: string; project_id: string | null; startup_name: string | null }>(
      db.from("svi_accounts").select("email, project_id, startup_name").eq("id", accountId).limit(1),
    ))[0];
    const email = normaliseRecipient(acct?.email);
    if (!acct || !email) { bump(r, "no_account"); continue; }
    let aq = db.from("svi_analyses").select("created_at").eq("email", acct.email);
    aq = acct.project_id ? aq.eq("project_id", acct.project_id) : aq;
    const last = (await rows<{ created_at: string }>(aq.order("created_at", { ascending: false }).limit(1)))[0];
    if (!last) { bump(r, "never_analysed"); continue; }
    const fresh = items.filter((e) => e.created_at > last.created_at);
    if (fresh.length === 0) { bump(r, "no_new_evidence"); continue; }
    const userId = await userIdByEmail(db, email);
    if (!userId) { bump(r, "no_user"); continue; }
    const elig = await commercialEligibility(email, "rerun_prompt");
    if (!elig.ok) { bump(r, elig.reason); continue; }
    const labels = fresh.map((e) => (e.label ?? "").trim()).filter(Boolean).slice(0, 3);
    await queue(ctx, r, [
      {
        email,
        user_id: userId,
        campaign: "rerun_prompt",
        scheduled_for: nextCommercialSendSlot(now).toISOString(),
        payload: {
          lifecycle: { rerun: { new_evidence_count: fresh.length, last_scored_at: last.created_at, evidence_labels: labels } },
          project_id: acct.project_id,
          startup: acct.startup_name,
          unsubscribe_token: elig.token,
        },
      },
    ], { dedupeDays: 90, dedupeKey: { path: "payload->lifecycle->rerun->>last_scored_at", value: last.created_at } });
  }
}

// ── EM16 free quota used ─────────────────────────────────────────────────────

async function scanQuota(ctx: ScanContext, r: ScanFlowResult): Promise<void> {
  const { db, now } = ctx;
  const grants = await rows<{ email: string; delivered_at: string | null; sequence_no: number }>(
    db
      .from("free_report_grants")
      .select("email, delivered_at, sequence_no")
      .eq("sequence_no", 2)
      .eq("delivery_status", "sent")
      .lte("delivered_at", new Date(now.getTime() - 3 * DAY_MS).toISOString())
      .gte("delivered_at", new Date(now.getTime() - 10 * DAY_MS).toISOString())
      .limit(SCAN_LIMIT),
  );
  for (const g of grants) {
    const email = normaliseRecipient(g.email);
    if (!email) { bump(r, "excluded_email"); continue; }
    r.candidates++;
    const userId = await userIdByEmail(db, email);
    if (userId) {
      const paid = await hasPurchased(db, userId);
      if (paid === null) { bump(r, "purchase_unreadable"); continue; }
      if (paid) { bump(r, "purchased"); continue; }
    }
    const elig = await commercialEligibility(email, "free_quota_used");
    if (!elig.ok) { bump(r, elig.reason); continue; }
    await queue(ctx, r, [
      {
        email,
        user_id: userId,
        campaign: "free_quota_used",
        scheduled_for: nextCommercialSendSlot(now).toISOString(),
        payload: { lifecycle: { quota: { reports_used: g.sequence_no, delivered_at: g.delivered_at ?? now.toISOString() } }, unsubscribe_token: elig.token },
      },
    ], { dedupeDays: 365 });
  }
}

// ── EM20 sunset ──────────────────────────────────────────────────────────────

export const SUNSET_INACTIVE_DAYS = 90;

/** Commercial categories the sunset switches off (payment receipts, svi_alerts and money_radar service mail stay). */
export const SUNSET_OFF = { weekly_reports: false, product_updates: false, promotions: false, digest_weekly: false } as const;

async function activeUserIds(db: LifecycleDb, ids: string[], since: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const found = await rows<{ user_id: string }>(db.from("sessions").select("user_id").in("user_id", chunk).gte("last_used_at", since).limit(1000));
    for (const f of found) out.add(f.user_id);
  }
  return out;
}

async function scanSunset(ctx: ScanContext, r: ScanFlowResult): Promise<void> {
  const { db, now } = ctx;
  const cutoff = new Date(now.getTime() - SUNSET_INACTIVE_DAYS * DAY_MS).toISOString();

  // 1. Ask: 90 days without a sign-in.
  const users = await rows<{ id: string; email: string; last_login_at: string | null }>(
    db
      .from("app_users")
      .select("id, email, last_login_at")
      .lte("created_at", cutoff)
      .or(`last_login_at.is.null,last_login_at.lt.${cutoff}`)
      .is("erased_at", null)
      .limit(SCAN_LIMIT),
  );
  const active = await activeUserIds(db, users.map((u) => u.id), cutoff);
  for (const u of users) {
    const email = normaliseRecipient(u.email);
    if (!email) { bump(r, "excluded_email"); continue; }
    if (active.has(u.id)) { bump(r, "session_active"); continue; }
    r.candidates++;
    const prefs = await getEmailPreferences(email);
    if (prefs?.unsubscribed_all) { bump(r, "unsubscribed"); continue; }
    if (prefs && !Object.keys(SUNSET_OFF).some((k) => (prefs as unknown as Record<string, unknown>)[k] === true)) { bump(r, "no_commercial_category"); continue; }
    const elig = await commercialEligibility(email, "sunset_check");
    if (!elig.ok) { bump(r, elig.reason); continue; }
    const lastSeen = u.last_login_at;
    const days = lastSeen ? Math.floor((now.getTime() - Date.parse(lastSeen)) / DAY_MS) : SUNSET_INACTIVE_DAYS;
    await queue(ctx, r, [
      {
        email,
        user_id: u.id,
        campaign: "sunset_check",
        scheduled_for: nextCommercialSendSlot(now).toISOString(),
        payload: { lifecycle: { sunset: { last_seen_at: lastSeen, days_inactive: days } }, unsubscribe_token: elig.token },
      },
    ], { dedupeDays: 180 });
  }

  // 2. Enforce: sunset mail sent ≥ 30 d ago, no sign-in and no saved preference since → commercial off.
  r.sunsetOff = [];
  const asked = await rows<{ email: string; user_id: string | null; sent_at: string }>(
    db
      .from("email_drips")
      .select("email, user_id, sent_at")
      .eq("campaign", "sunset_check")
      .eq("status", "sent")
      .lte("sent_at", new Date(now.getTime() - SUNSET_GRACE_DAYS * DAY_MS).toISOString())
      .gte("sent_at", new Date(now.getTime() - (SUNSET_GRACE_DAYS + 15) * DAY_MS).toISOString())
      .limit(SCAN_LIMIT),
  );
  for (const a of asked) {
    if (a.user_id) {
      const seen = await rows<{ user_id: string }>(db.from("sessions").select("user_id").eq("user_id", a.user_id).gt("last_used_at", a.sent_at).limit(1));
      if (seen.length > 0) { bump(r, "kept:signed_in"); continue; }
      const login = await rows<{ last_login_at: string | null }>(db.from("app_users").select("last_login_at").eq("id", a.user_id).limit(1));
      if (login[0]?.last_login_at && login[0].last_login_at > a.sent_at) { bump(r, "kept:signed_in"); continue; }
    }
    const pref = await rows<{ updated_at: string | null; unsubscribed_all: boolean | null }>(
      db.from("email_preferences").select("updated_at, unsubscribed_all").eq("email", a.email).limit(1),
    );
    // One hour of slack: sendEmail may create the preference row while sending the sunset mail itself.
    const updated = Date.parse(pref[0]?.updated_at ?? "");
    if (Number.isFinite(updated) && updated > Date.parse(a.sent_at) + HOUR_MS) { bump(r, "kept:preferences_saved"); continue; }
    if (!pref[0] || pref[0].unsubscribed_all) { bump(r, "already_off"); continue; }
    if (!ctx.dry) {
      const { error } = await db.from("email_preferences").update({ ...SUNSET_OFF, updated_at: now.toISOString() }).eq("email", a.email);
      if (error) { bump(r, "sunset_update_failed"); continue; }
    }
    r.sunsetOff.push(a.email);
  }
}

// ── EM19 monthly digest ──────────────────────────────────────────────────────

/** The calendar month (UTC) before `now`: [start, end), "September 2026", "2026-09". */
export function previousMonth(now: Date): { start: Date; end: Date; label: string; key: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));
  const label = start.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
  const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, end, label, key };
}

/** Stage labels by svi_accounts.current_stage (0–7), mirrored from report-pipeline/run-for-project. */
const STAGE_LABELS = ["Concept", "Validated Idea", "MVP / Prototype", "Early Traction", "Revenue", "Growth", "Scale", "Corporation"] as const;

/**
 * Pure: the share of the same-stage cohort scoring strictly below `score`,
 * or null when the cohort is too small to publish (BENCHMARK_MIN_N = 10).
 */
export function peerPercentile(score: number | null, cohort: readonly number[]): { percentile: number | null; n: number } {
  const n = cohort.length;
  if (score === null || !mayShowPercentile(n)) return { percentile: null, n };
  const below = cohort.filter((c) => c < score).length;
  return { percentile: Math.round((below / n) * 100), n };
}

export interface DigestDeps {
  buildFounderDigest: typeof import("@/lib/digest/weekly").buildFounderDigest;
  buildNudgeFor: typeof import("@/lib/nudge/load-founder-nudge").buildNudgeFor;
}

async function loadDigestDeps(): Promise<DigestDeps> {
  const [{ buildFounderDigest }, { buildNudgeFor }] = await Promise.all([import("@/lib/digest/weekly"), import("@/lib/nudge/load-founder-nudge")]);
  return { buildFounderDigest, buildNudgeFor };
}

async function scanDigest(ctx: ScanContext, r: ScanFlowResult, deps?: DigestDeps): Promise<void> {
  const { db, now } = ctx;
  const d = deps ?? (await loadDigestDeps());
  const period = previousMonth(now);
  const activeSince = new Date(now.getTime() - SUNSET_INACTIVE_DAYS * DAY_MS).toISOString();

  const prefs = await rows<{ email: string; digest_weekly: boolean | null }>(
    db.from("email_preferences").select("email, digest_weekly").eq("weekly_reports", true).eq("unsubscribed_all", false).limit(SCAN_LIMIT * 5),
  );
  // Stage cohorts for the peer percentile — one read per run.
  const cohortRows = await rows<{ current_svi: number | null; current_stage: number | null; email: string | null }>(
    db.from("svi_accounts").select("current_svi, current_stage, email").not("current_svi", "is", null).limit(5000),
  );
  const cohorts = new Map<number, number[]>();
  for (const c of cohortRows) {
    if (typeof c.current_svi !== "number" || !normaliseRecipient(c.email)) continue;
    const st = typeof c.current_stage === "number" ? c.current_stage : 0;
    (cohorts.get(st) ?? cohorts.set(st, []).get(st)!).push(c.current_svi);
  }

  let processed = 0;
  for (const p of prefs) {
    if (p.digest_weekly === false) { bump(r, "digest_off"); continue; }
    const email = normaliseRecipient(p.email);
    if (!email) { bump(r, "excluded_email"); continue; }
    const user = (await rows<{ id: string; email: string; display_name: string | null; last_login_at: string | null }>(
      db.from("app_users").select("id, email, display_name, last_login_at").eq("email", email).limit(1),
    ))[0];
    if (!user) { bump(r, "no_user"); continue; }
    let active = Boolean(user.last_login_at && user.last_login_at >= activeSince);
    if (!active) active = (await activeUserIds(db, [user.id], activeSince)).has(user.id);
    if (!active) { bump(r, "inactive_90d"); continue; }
    if (processed >= SCAN_LIMIT) { bump(r, "over_run_limit"); continue; }
    processed++;
    r.candidates++;
    const elig = await commercialEligibility(email, "monthly_digest");
    if (!elig.ok) { bump(r, elig.reason); continue; }

    const digest = await d.buildFounderDigest(user.id, period.start, period.end, { includeQuiet: true });
    if (!digest) { bump(r, "no_digest"); continue; }
    let missing: DigestMissingItem[] = [];
    let nextAction: DigestMissingItem | null = null;
    try {
      const nudge = await d.buildNudgeFor(db as never, { id: user.id, email: user.email, display_name: user.display_name });
      missing = nudge.result.missing.slice(0, 3).map((m) => ({ title: m.title, cta_url: absolute(m.cta_url) }));
      nextAction = nudge.result.next_action ? { title: nudge.result.next_action.title, cta_url: absolute(nudge.result.next_action.cta_url) } : null;
    } catch {
      /* the digest still goes without the gaps block */
    }
    const acct = (await rows<{ current_stage: number | null; startup_name: string | null }>(
      digest.projectId
        ? db.from("svi_accounts").select("current_stage, startup_name").eq("project_id", digest.projectId).limit(1)
        : db.from("svi_accounts").select("current_stage, startup_name").eq("email", email).limit(1),
    ))[0];
    const stage = typeof acct?.current_stage === "number" ? acct.current_stage : null;
    const current = digest.svi?.current ?? null;
    const peer = peerPercentile(current, stage !== null ? cohorts.get(stage) ?? [] : []);
    const data: MonthlyDigestData = {
      period_label: period.label,
      period_key: period.key,
      svi_current: current,
      svi_previous: digest.svi?.previous ?? null,
      views: digest.views.count,
      leads: digest.leads.count,
      missing_top3: missing,
      next_action: nextAction,
      percentile: peer.percentile,
      cohort_n: peer.n,
      stage_label: stage !== null ? STAGE_LABELS[stage] ?? null : null,
      quiet: digest.views.count === 0 && digest.leads.count === 0 && !(digest.svi && (digest.svi.newSnapshot || (digest.svi.delta ?? 0) !== 0)),
    };
    await queue(ctx, r, [
      {
        email,
        user_id: user.id,
        campaign: "monthly_digest",
        scheduled_for: nextCommercialSendSlot(now).toISOString(),
        payload: { lifecycle: { digest: data }, project_id: digest.projectId, startup: acct?.startup_name ?? null, unsubscribe_token: elig.token },
      },
    ], { dedupeDays: 40, dedupeKey: { path: "payload->lifecycle->digest->>period_key", value: period.key } });
  }
}

function absolute(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au").replace(/\/$/, "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

// ── Runner ───────────────────────────────────────────────────────────────────

const RUNNERS: Record<ScanFlow, (ctx: ScanContext, r: ScanFlowResult) => Promise<void>> = {
  evidence: scanEvidenceGap,
  intake: scanIntake,
  rerun: scanRerun,
  quota: scanQuota,
  sunset: scanSunset,
  digest: (ctx, r) => scanDigest(ctx, r),
};

/** Run the requested flows; one flow failing (missing table, bad read) never stops the others. */
export async function runLifecycleScan(ctx: ScanContext, flows: readonly ScanFlow[]): Promise<ScanFlowResult[]> {
  const out: ScanFlowResult[] = [];
  for (const flow of flows) {
    const r: ScanFlowResult = { flow, candidates: 0, queued: [], skipped: {} };
    try {
      await RUNNERS[flow](ctx, r);
    } catch (err) {
      r.error = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    }
    out.push(r);
  }
  return out;
}

export const __test = { scanDigest };
