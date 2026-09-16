// Evaluator landing loaders — G13-W4-IA4 (spec §C.1, four blocks).
//
// One `loadInvestorLanding()` per request, four block summaries in ONE
// Promise.all; every loader is fail-soft (an empty summary, never a throw)
// so the landing always renders and every block can show its §C.1 empty
// state. Nothing here invents data: no placeholder cohorts, no demo
// applicants (accelerator-portal's demo rows stay off the landing).
//
//   block 1 evaluating  → listEvaluations() + buildEvaluatorProgress()
//                         (count · avg SVI · movers via evaluator progress
//                         over svi_index_snapshots · consent summary)
//   block 2 dealflow    → getDealFlowV2() top 5 for the PRIMARY mandate
//                         (advisor "client movers" / accelerator
//                         "applications to review" derive from block 1)
//   block 3 quota       → getReportQuota() (trial + monthly cap) + credits
//                         balance + plan label
//   block 4 mandate     → listMandates().primary + sectionsFilled()
//
// Pure helpers (`summariseEvaluations`, `mandateSummaryFor`, `blockOrderFor`)
// are exported for the colocated test.

import "server-only";
import { listEvaluations, type EvaluationListRow } from "@/lib/evaluations";
import { buildEvaluatorProgress } from "@/lib/evaluations/progress-radar";
import type { EvaluatorProgressItem } from "@/lib/evaluations/progress-shared";
import { getReportQuota, type ReportQuota, NO_TRIAL } from "@/lib/evaluations/report-quota";
import { getBalance } from "@/lib/credits";
import { evaluatorPlanLabel } from "@/lib/plans/signup-plans";
import { PLANS_V2 } from "@/lib/plans-v2";
import { getDealFlowV2, type DealFlowRowV2 } from "./dealflow";
import { listMandates, sectionsFilled, type InvestorMandate } from "./mandates";
import type { PersonaKey } from "@/lib/nav/persona";

export type LandingPersona = Extract<PersonaKey, "investor_angel" | "investor_vc" | "advisor" | "accelerator">;
export type LandingVariant = "investor" | "advisor" | "accelerator";

export function variantFor(persona: LandingPersona): LandingVariant {
  if (persona === "advisor") return "advisor";
  if (persona === "accelerator") return "accelerator";
  return "investor";
}

export const INVESTOR_LANDING_BLOCKS = ["evaluating", "dealflow", "quota", "mandate"] as const;
export type InvestorLandingBlock = (typeof INVESTOR_LANDING_BLOCKS)[number];

/** Block 4 renders only while fewer than this many of the 7 mandate sections are set (§C.1). */
export const MANDATE_COMPLETE_SECTIONS = 3;

// ─── Block 1 ─────────────────────────────────────────────────────────────────

export interface ConsentSummary {
  attributed_only: number;
  reports_shared: number;
  full_mentor: number;
  /** Founder has claimed the invite (`claimed_at`). */
  claimed: number;
}

export interface Mover {
  evaluationId: string;
  name: string;
  sviNow: number | null;
  delta: number;
}

export interface EvaluatingSummary {
  count: number;
  /** Mean of the latest SVI over scored evaluations; null when none is scored. */
  avgSvi: number | null;
  scored: number;
  movers: Mover[];
  consent: ConsentSummary;
  /** Evaluations without a score yet, newest first (accelerator "applications to review"). */
  unscored: EvaluationListRow[];
  /** Newest first — the roster rows the advisor / accelerator variants list. */
  rows: EvaluationListRow[];
}

export const EMPTY_EVALUATING: EvaluatingSummary = Object.freeze({
  count: 0,
  avgSvi: null,
  scored: 0,
  movers: [],
  consent: { attributed_only: 0, reports_shared: 0, full_mentor: 0, claimed: 0 },
  unscored: [],
  rows: [],
}) as EvaluatingSummary;

/** Pure: count · avg SVI · consent summary · unscored rows, plus movers from the progress items. */
export function summariseEvaluations(rows: readonly EvaluationListRow[], movers: readonly EvaluatorProgressItem[] = [], limit = 3): EvaluatingSummary {
  if (rows.length === 0) return EMPTY_EVALUATING;
  const scoredRows = rows.filter((r) => typeof r.latestSvi === "number");
  const avg = scoredRows.length ? Math.round((scoredRows.reduce((a, r) => a + (r.latestSvi as number), 0) / scoredRows.length) * 10) / 10 : null;
  const consent: ConsentSummary = { attributed_only: 0, reports_shared: 0, full_mentor: 0, claimed: 0 };
  for (const r of rows) {
    if (r.consentTier in consent) consent[r.consentTier as keyof ConsentSummary] += 1;
    if (r.claimedAt) consent.claimed += 1;
  }
  const evalIds = new Set(rows.map((r) => r.id));
  const mv = movers
    .filter((m) => typeof m.delta === "number" && m.delta !== 0 && evalIds.has(m.evaluationId))
    .sort((a, b) => Math.abs(b.delta as number) - Math.abs(a.delta as number))
    .slice(0, limit)
    .map((m) => ({ evaluationId: m.evaluationId, name: m.name, sviNow: m.sviNow, delta: m.delta as number }));
  return {
    count: rows.length,
    avgSvi: avg,
    scored: scoredRows.length,
    movers: mv,
    consent,
    unscored: rows.filter((r) => r.latestSvi == null),
    rows: [...rows],
  };
}

async function loadEvaluating(userId: string): Promise<EvaluatingSummary> {
  try {
    const rows = await listEvaluations(userId);
    if (rows.length === 0) return EMPTY_EVALUATING;
    const progress = await buildEvaluatorProgress({ userId }).catch(() => null);
    return summariseEvaluations(rows, progress?.items ?? []);
  } catch (err) {
    console.warn("[blockid:investor-landing] evaluating", err instanceof Error ? err.message : String(err));
    return EMPTY_EVALUATING;
  }
}

// ─── Block 2 ─────────────────────────────────────────────────────────────────

export interface DealFlowSummary {
  migrated: boolean;
  mandate: InvestorMandate | null;
  rows: DealFlowRowV2[];
  totalAboveFloor: number;
  neverComputed: boolean;
}

export const EMPTY_DEALFLOW: DealFlowSummary = Object.freeze({ migrated: false, mandate: null, rows: [], totalAboveFloor: 0, neverComputed: true }) as DealFlowSummary;

async function loadDealFlow(userId: string, limit = 5): Promise<DealFlowSummary> {
  try {
    const df = await getDealFlowV2(userId, { sort: "fit" });
    return { migrated: df.migrated, mandate: df.mandate, rows: df.rows.slice(0, limit), totalAboveFloor: df.total_above_floor, neverComputed: df.never_computed };
  } catch (err) {
    console.warn("[blockid:investor-landing] dealflow", err instanceof Error ? err.message : String(err));
    return EMPTY_DEALFLOW;
  }
}

// ─── Block 3 ─────────────────────────────────────────────────────────────────

export interface QuotaSummary {
  quota: ReportQuota;
  credits: number;
  planId: string | null;
  planLabel: string;
}

export function planLabelFor(planId: string | null | undefined): string {
  if (!planId) return "Free";
  const pub = evaluatorPlanLabel(planId);
  if (pub) return pub;
  const row = PLANS_V2.find((p) => p.id === planId);
  return row?.name ?? planId;
}

async function loadQuota(user: { id: string; plan?: string | null }): Promise<QuotaSummary> {
  const [quota, credits] = await Promise.all([
    getReportQuota(user).catch(() => ({ limit: 0, used: 0, remaining: 0, unlimited: false, configured: false, trial: NO_TRIAL }) as ReportQuota),
    getBalance(user.id).catch(() => 0),
  ]);
  return { quota, credits, planId: user.plan ?? null, planLabel: planLabelFor(user.plan) };
}

// ─── Block 4 ─────────────────────────────────────────────────────────────────

export interface MandateSummary {
  migrated: boolean;
  mandate: InvestorMandate | null;
  /** 0..7 sections carrying a non-default value (`sectionsFilled`). */
  sectionsFilled: number;
  /** No mandate at all (block 4 takes block 2's slot on the investor variant). */
  empty: boolean;
  /** Block 4 renders (empty OR fewer than MANDATE_COMPLETE_SECTIONS sections). */
  needsSetup: boolean;
}

/** Pure — pinned by the test. */
export function mandateSummaryFor(mandate: InvestorMandate | null, migrated = true): MandateSummary {
  const filled = mandate ? sectionsFilled(mandate) : 0;
  const empty = !mandate;
  return { migrated, mandate, sectionsFilled: filled, empty, needsSetup: empty || filled < MANDATE_COMPLETE_SECTIONS };
}

async function loadMandate(userId: string): Promise<MandateSummary> {
  try {
    const list = await listMandates(userId);
    return mandateSummaryFor(list.primary, list.migrated);
  } catch {
    return mandateSummaryFor(null, false);
  }
}

// ─── Assembly ────────────────────────────────────────────────────────────────

export interface InvestorLandingData {
  persona: LandingPersona;
  variant: LandingVariant;
  evaluating: EvaluatingSummary;
  dealflow: DealFlowSummary;
  quota: QuotaSummary;
  mandate: MandateSummary;
}

/**
 * Block order per variant (§C.1): on the investor variant an EMPTY mandate
 * moves block 4 into block 2's slot ("never a blank card", R11); otherwise
 * block 4 trails and only while `needsSetup`.
 */
export function blockOrderFor(variant: LandingVariant, mandate: Pick<MandateSummary, "empty" | "needsSetup">): InvestorLandingBlock[] {
  if (variant === "investor" && mandate.empty) return ["evaluating", "mandate", "quota"];
  return mandate.needsSetup ? ["evaluating", "dealflow", "quota", "mandate"] : ["evaluating", "dealflow", "quota"];
}

export async function loadInvestorLanding(user: { id: string; plan?: string | null }, persona: LandingPersona): Promise<InvestorLandingData> {
  const variant = variantFor(persona);
  const [evaluating, dealflow, quota, mandate] = await Promise.all([
    loadEvaluating(user.id),
    variant === "investor" ? loadDealFlow(user.id) : Promise.resolve(EMPTY_DEALFLOW),
    loadQuota(user),
    loadMandate(user.id),
  ]);
  return { persona, variant, evaluating, dealflow, quota, mandate };
}
