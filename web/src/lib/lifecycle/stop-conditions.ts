// G34-BT4 — send-time stop conditions for the lifecycle flows (plan §9.2
// "Dừng khi"). The drip worker asks `lifecycleStopDecision()` for every due
// lifecycle row AFTER the preference / consent / cap gate and BEFORE the
// claim:
//
//   send    — nothing reached the flow's goal; go ahead
//   cancel  — the goal is reached (evidence added, onboarding finished,
//             re-run started, purchase made, user active again); the row is
//             retired as `cancelled`, never sent
//   defer   — the goal check could not be read; the row stays pending for a
//             later tick (a commercial nudge must not go out on a guess)
//
// Every read is bounded and wrapped — a thrown chain is a `defer`.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isLifecycleCampaign, LIFECYCLE_META } from "./campaigns";
import type { LifecyclePayload } from "./payload";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any };

export type StopDecision = { action: "send" } | { action: "cancel"; reason: string } | { action: "defer"; reason: string };

export interface StopDrip {
  campaign: string;
  email: string;
  user_id: string | null;
  created_at?: string | null;
  payload?: { lifecycle?: LifecyclePayload; project_id?: string | null } | null;
}

const SEND: StopDecision = { action: "send" };

/** Orders / revenue kinds that mean the recipient has paid for something. */
export const PURCHASE_REVENUE_KINDS = ["subscribe", "trial_convert", "upgrade", "renewal", "credit_pack"] as const;
const PAID_ORDER_STATUSES = ["PAID", "GENERATING", "READY"] as const;
const FREE_PLAN_IDS = new Set(["", "free", "founder_free"]);

async function accountIdFor(db: Db, email: string, projectId: string | null | undefined): Promise<{ ok: boolean; id: string | null }> {
  let q = db.from("svi_accounts").select("id").eq("email", email);
  q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);
  const { data, error } = await q.limit(1);
  if (error) return { ok: false, id: null };
  const id = (Array.isArray(data) ? data[0]?.id : null) as string | null | undefined;
  return { ok: true, id: id ?? null };
}

async function evidenceGapStop(db: Db, drip: StopDrip): Promise<StopDecision> {
  const acct = await accountIdFor(db, drip.email, drip.payload?.project_id ?? null);
  if (!acct.ok) return { action: "defer", reason: "evidence lookup unavailable" };
  if (!acct.id) return SEND;
  const { count, error } = await db.from("svi_evidence").select("id", { count: "exact", head: true }).eq("account_id", acct.id);
  if (error) return { action: "defer", reason: "evidence lookup unavailable" };
  return (count ?? 0) > 0 ? { action: "cancel", reason: "goal reached: evidence added" } : SEND;
}

async function intakeStop(db: Db, drip: StopDrip): Promise<StopDecision> {
  if (!drip.user_id) return { action: "cancel", reason: "no account" };
  const { data, error } = await db
    .from("app_users")
    .select("onboarding_completed, onboarding_state")
    .eq("id", drip.user_id)
    .maybeSingle();
  if (error) return { action: "defer", reason: "onboarding lookup unavailable" };
  const row = data as { onboarding_completed?: boolean | null; onboarding_state?: { updated_at?: string } | null } | null;
  if (!row) return { action: "cancel", reason: "no account" };
  if (row.onboarding_completed === true) return { action: "cancel", reason: "goal reached: onboarding completed" };
  const idleSince = Date.parse(drip.payload?.lifecycle?.intake?.idle_since ?? "");
  const saved = Date.parse(row.onboarding_state?.updated_at ?? "");
  if (Number.isFinite(idleSince) && Number.isFinite(saved) && saved > idleSince) {
    return { action: "cancel", reason: "goal reached: onboarding resumed" };
  }
  return SEND;
}

async function rerunStop(db: Db, drip: StopDrip): Promise<StopDecision> {
  const last = drip.payload?.lifecycle?.rerun?.last_scored_at;
  if (!last) return SEND;
  let q = db.from("svi_analyses").select("id").eq("email", drip.email).gt("created_at", last);
  const pid = drip.payload?.project_id;
  if (pid) q = q.eq("project_id", pid);
  const { data, error } = await q.limit(1);
  if (error) return { action: "defer", reason: "analysis lookup unavailable" };
  return Array.isArray(data) && data.length > 0 ? { action: "cancel", reason: "goal reached: re-run started" } : SEND;
}

/** Has this user paid for anything (plan, credit pack, report)? null = unreadable. */
export async function hasPurchased(db: Db, userId: string): Promise<boolean | null> {
  try {
    const { data: users, error: uErr } = await db.from("app_users").select("plan").eq("id", userId).limit(1);
    if (uErr) return null;
    const plan = String((users?.[0] as { plan?: string | null } | undefined)?.plan ?? "");
    if (!FREE_PLAN_IDS.has(plan)) return true;
    const { data: rev, error: rErr } = await db
      .from("revenue_events")
      .select("id")
      .eq("user_id", userId)
      .in("kind", [...PURCHASE_REVENUE_KINDS])
      .limit(1);
    if (rErr) return null;
    if (Array.isArray(rev) && rev.length > 0) return true;
    const { data: orders, error: oErr } = await db
      .from("report_orders")
      .select("id")
      .eq("user_id", userId)
      .in("status", [...PAID_ORDER_STATUSES])
      .limit(1);
    if (oErr) return null;
    return Array.isArray(orders) && orders.length > 0;
  } catch {
    return null;
  }
}

async function quotaStop(db: Db, drip: StopDrip): Promise<StopDecision> {
  if (!drip.user_id) return SEND;
  const paid = await hasPurchased(db, drip.user_id);
  if (paid === null) return { action: "defer", reason: "purchase lookup unavailable" };
  return paid ? { action: "cancel", reason: "goal reached: purchase made" } : SEND;
}

async function sunsetStop(db: Db, drip: StopDrip): Promise<StopDecision> {
  if (!drip.user_id || !drip.created_at) return SEND;
  const { data, error } = await db
    .from("sessions")
    .select("last_used_at")
    .eq("user_id", drip.user_id)
    .gt("last_used_at", drip.created_at)
    .limit(1);
  if (error) return { action: "defer", reason: "session lookup unavailable" };
  return Array.isArray(data) && data.length > 0 ? { action: "cancel", reason: "goal reached: signed in again" } : SEND;
}

/**
 * The stop decision for one due drip. Non-lifecycle campaigns (onboarding,
 * radar, the A$3 unlock nudge) always answer `send` — they keep their own
 * guards in lib/email-drip.ts.
 */
export async function lifecycleStopDecision(drip: StopDrip, db: Db | null = getSupabaseAdmin() as unknown as Db | null): Promise<StopDecision> {
  if (!isLifecycleCampaign(drip.campaign)) return SEND;
  if (!db) return LIFECYCLE_META[drip.campaign].emailClass === "T" ? SEND : { action: "defer", reason: "db unavailable" };
  try {
    switch (drip.campaign) {
      case "evidence_gap_1":
      case "evidence_gap_2":
        return await evidenceGapStop(db, drip);
      case "intake_abandoned_1":
      case "intake_abandoned_2":
        return await intakeStop(db, drip);
      case "rerun_prompt":
        return await rerunStop(db, drip);
      case "free_quota_used":
        return await quotaStop(db, drip);
      case "sunset_check":
        return await sunsetStop(db, drip);
      case "score_updated":
      case "monthly_digest":
        return SEND;
    }
  } catch (err) {
    return { action: "defer", reason: `stop check failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200) };
  }
}
