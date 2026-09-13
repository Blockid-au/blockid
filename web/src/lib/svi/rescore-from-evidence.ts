// S25-A — the evidence rescore, lifted out of `api/svi/rescore-from-evidence`
// so the weekly connector resync (`api/cron/connector-resync`) can rescore an
// account with the SAME arithmetic the founder's button uses.
//
// What changed vs the pre-S25-A route (roadmap-v2 reconciliation 2026-09-11,
// "Revenue-to-SVI automatic feed (partial: flat +15 per connected_source,
// MRR magnitude ignored)"):
//
//   * Revenue-connector evidence rows (`evidence_type` stripe / xero_revenue,
//     `connected_source`) no longer take the flat +15. The freshest
//     connected-revenue figure — connector_snapshots first, then the legacy
//     svi_signals / svi_evidence rows (lib/connected-revenue.ts) — goes
//     through `scoreConnectedRevenue()` (lib/svi/connected-revenue-score.ts)
//     and lands on TRE with magnitude, growth, churn and freshness decay.
//   * Every other evidence row keeps the confidence-level table below.
//
// The Supabase client is injected; the route passes the admin client after
// its own auth + project-scope gate, the cron passes the same admin client
// for the account whose connector metrics just moved.

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractSignals, computeSVI, type SVISubScore } from "@/lib/svi-analysis";
import { checkAndAwardBadges, type BadgeContext } from "@/lib/badges";
import { loadConnectedRevenueSignals } from "@/lib/connected-revenue";
import type { ConnectedRevenueSignal } from "@/lib/valuation-mrr-bridge";
import {
  CONNECTED_REVENUE_DIMENSION,
  scoreConnectedRevenue,
  type ConnectedRevenueScore,
} from "@/lib/svi/connected-revenue-score";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

/** Evidence bonus points per confidence level (non-revenue rows). */
export const EVIDENCE_BONUS: Record<string, number> = {
  self_declared: 3,
  public_url: 6,
  document_uploaded: 10,
  connected_source: 15,
};

/** Evidence types whose points come from the magnitude table instead of the flat bonus. */
export const REVENUE_CONNECTOR_EVIDENCE_TYPES = new Set(["stripe", "xero_revenue"]);

/**
 * Is this the revenue row the magnitude table replaces? Keyed on evidence
 * type AND dimension: the Stripe callback / resync also write a
 * `{ evidence_type: "stripe", dimension: "mpc" }` customer-count row, and
 * that one is not revenue — it keeps its flat bonus (S25-review: carving it
 * out by type alone cost every Stripe-linked account 15 MPC points).
 */
export function isRevenueConnectorRow(ev: Pick<EvidenceRowLite, "evidence_type" | "confidence_level" | "dimension">): boolean {
  return (
    ev.confidence_level === "connected_source" &&
    REVENUE_CONNECTOR_EVIDENCE_TYPES.has(ev.evidence_type ?? "") &&
    ev.dimension === CONNECTED_REVENUE_DIMENSION
  );
}

export const VALID_DIMENSIONS = new Set(["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"]);

// Weight map matches computeSVI dimension weights.
const DIMENSION_WEIGHTS: Record<string, number> = {
  ftv: 0.15, mpc: 0.18, ptd: 0.12, tre: 0.2,
  cgh: 0.12, iri: 0.1, lco: 0.08, svm: 0.05,
};

export interface EvidenceRowLite {
  evidence_type: string | null;
  confidence_level: string | null;
  dimension: string | null;
  label?: string | null;
}

/**
 * Pure: per-dimension flat bonuses from the evidence vault, with the
 * revenue-connector rows carved out (they are priced by magnitude).
 */
export function flatEvidenceBonuses(evidence: EvidenceRowLite[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ev of evidence) {
    const dim = ev.dimension ?? "";
    if (!VALID_DIMENSIONS.has(dim)) continue;
    if (isRevenueConnectorRow(ev)) continue;
    const bonus = EVIDENCE_BONUS[ev.confidence_level ?? ""] ?? EVIDENCE_BONUS.self_declared;
    out[dim] = (out[dim] ?? 0) + bonus;
  }
  return out;
}

/** Pure: the freshest positive connected-revenue signal (age is priced by the score's decay, not filtered here). */
export function freshestRevenueSignal(signals: ConnectedRevenueSignal[]): ConnectedRevenueSignal | null {
  let best: ConnectedRevenueSignal | null = null;
  for (const s of signals) {
    if (!(s.mrrAud > 0) || !Number.isFinite(s.mrrAud)) continue;
    const t = new Date(s.capturedAt).getTime();
    if (!Number.isFinite(t)) continue;
    if (!best || t > new Date(best.capturedAt).getTime()) best = s;
  }
  return best;
}

export interface RescoreArgs {
  accountId: string;
  /** `svi_accounts.current_svi` as read by the caller (null → 100). */
  currentSvi: number | null;
  /** The project OWNER's email — the key svi_analyses / svi_accounts use. */
  dataEmail: string;
  projectId: string | null;
  /** The project OWNER's user id — svi_signals / connector_snapshots key; null skips those stores. */
  ownerUserId: string | null;
  now?: Date;
}

export interface RescoreResult {
  previousSVI: number;
  newSVI: number;
  delta: number;
  stage: number | null;
  evidenceCount: number;
  evidenceBonusApplied: number;
  /** The magnitude contribution applied to TRE, or null when no connected revenue was usable. */
  connectedRevenue: (ConnectedRevenueScore & { provider: string; capturedAt: string }) | null;
  newBadges: string[];
}

export async function rescoreAccountFromEvidence(supabase: Db, args: RescoreArgs): Promise<RescoreResult> {
  const now = args.now ?? new Date();
  const { accountId, dataEmail, projectId } = args;

  // 1. Latest analysis — scoped by project_id.
  const analysisQuery = supabase
    .from("svi_analyses")
    .select("id, raw_input, analysis_json")
    .eq("email", dataEmail)
    .order("created_at", { ascending: false })
    .limit(1);
  if (projectId) analysisQuery.eq("project_id", projectId);
  const { data: latestAnalysis } = await analysisQuery.maybeSingle();
  const rawInput = (latestAnalysis?.raw_input as string) ?? "";

  // 2. Evidence items.
  const { data: evidenceRaw } = await supabase
    .from("svi_evidence")
    .select("evidence_type, confidence_level, dimension, label")
    .eq("account_id", accountId);
  const evidence = (evidenceRaw ?? []) as EvidenceRowLite[];

  // 3. Re-extract + recompute (deterministic — no AI).
  const signals = extractSignals({ rawText: rawInput }, undefined, evidence as never[]);
  const newAnalysis = computeSVI(signals);

  // 4. Flat bonuses (revenue connectors carved out) + the magnitude contribution.
  const dimensionBonuses = flatEvidenceBonuses(evidence);
  const evidenceLines: Record<string, string[]> = {};
  for (const [dim, pts] of Object.entries(dimensionBonuses)) {
    evidenceLines[dim] = [`Evidence vault: +${pts} pts from evidence items`];
  }

  let connectedRevenue: RescoreResult["connectedRevenue"] = null;
  const revenueSignals = await loadConnectedRevenueSignals(supabase, {
    userId: args.ownerUserId,
    projectId,
    accountId,
  });
  const best = freshestRevenueSignal(revenueSignals);
  if (best) {
    const score = scoreConnectedRevenue({
      mrrAud: best.mrrAud,
      capturedAt: best.capturedAt,
      priorMrrAud: best.priorMrrAud ?? null,
      churnRate90dPct: best.churnRate90dPct ?? null,
      now,
    });
    connectedRevenue = { ...score, provider: best.provider, capturedAt: best.capturedAt };
    if (score.points > 0) {
      dimensionBonuses[CONNECTED_REVENUE_DIMENSION] = (dimensionBonuses[CONNECTED_REVENUE_DIMENSION] ?? 0) + score.points;
    }
    const providerLabel = best.provider === "stripe" ? "Stripe" : "Xero";
    (evidenceLines[CONNECTED_REVENUE_DIMENSION] ??= []).push(`Connected revenue (${providerLabel}): ${score.breakdown}`);
  }

  // 5. Apply bonuses to sub-score values (capped at 100) and recalculate adjustments.
  let totalEvidenceBonus = 0;
  for (const sub of newAnalysis.subs as SVISubScore[]) {
    const bonus = dimensionBonuses[sub.key] ?? 0;
    if (bonus > 0) {
      const oldValue = sub.value;
      sub.value = Math.min(100, sub.value + bonus);
      const addedPoints = sub.value - oldValue;
      const weight = DIMENSION_WEIGHTS[sub.key] ?? 0.1;
      const adjBonus = Math.round(addedPoints * weight * newAnalysis.confidenceMultiplier);
      sub.adjustment += adjBonus;
      totalEvidenceBonus += adjBonus;
    }
    for (const line of evidenceLines[sub.key] ?? []) sub.evidence.push(line);
  }

  newAnalysis.totalSVI = Math.round(Math.max(0, newAnalysis.totalSVI + totalEvidenceBonus));
  newAnalysis.netAdjustment += totalEvidenceBonus;

  const previousSVI = args.currentSvi ?? 100;
  const delta = newAnalysis.totalSVI - previousSVI;

  // 6. Persist: account, analysis, snapshot on a significant move.
  await supabase
    .from("svi_accounts")
    .update({ current_svi: newAnalysis.totalSVI, last_active_at: now.toISOString() })
    .eq("id", accountId);

  if (latestAnalysis?.id) {
    await supabase
      .from("svi_analyses")
      .update({
        total_svi: newAnalysis.totalSVI,
        net_adjustment: newAnalysis.netAdjustment,
        confidence_multiplier: newAnalysis.confidenceMultiplier,
        analysis_json: newAnalysis as unknown as Record<string, unknown>,
      })
      .eq("id", latestAnalysis.id);
  }

  if (Math.abs(delta) >= 2) {
    await supabase.from("svi_snapshots").insert({
      account_id: accountId,
      svi_total: newAnalysis.totalSVI,
      stage: newAnalysis.stage,
      delta,
      snapshot_date: now.toISOString().split("T")[0],
    });
  }

  // 7. Milestone badges.
  const { count: analysisCount } = await supabase
    .from("svi_analyses")
    .select("id", { count: "exact", head: true })
    .eq("email", dataEmail);

  const evidenceTypes = evidence.map((e) => e.evidence_type ?? "");

  const { data: accountFull } = await supabase
    .from("svi_accounts")
    .select("created_at, plan")
    .eq("id", accountId)
    .maybeSingle();

  const createdAt = accountFull?.created_at ? new Date(accountFull.created_at as string) : now;
  const daysActive = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

  const badgeCtx: BadgeContext = {
    totalAnalyses: analysisCount ?? 0,
    currentSVI: newAnalysis.totalSVI,
    evidenceCount: evidence.length,
    plan: (accountFull?.plan as string) ?? "free",
    hasGithub: evidenceTypes.includes("github"),
    hasStripe: evidenceTypes.includes("stripe") || Boolean(connectedRevenue),
    hasAnalytics: evidenceTypes.includes("analytics"),
    daysActive,
  };

  let newBadges: string[] = [];
  try {
    newBadges = await checkAndAwardBadges(accountId, badgeCtx);
  } catch (err) {
    console.error("[blockid:svi:rescore-from-evidence] badge check failed", err);
  }

  return {
    previousSVI,
    newSVI: newAnalysis.totalSVI,
    delta,
    stage: typeof newAnalysis.stage === "number" ? newAnalysis.stage : null,
    evidenceCount: evidence.length,
    evidenceBonusApplied: totalEvidenceBonus,
    connectedRevenue,
    newBadges,
  };
}
