// Persistence helpers for the idea-phase tools (server-only).
//
// Each helper takes the typed input from the corresponding pure-functional
// computer (computeIdeaValuation / computeEquitySplit / computeFundingPlan),
// recomputes the result server-side (cheap, deterministic), and writes a
// row scoped to the supplied user. mintFounderPack bundles the latest of
// each into a shareable pack with a /s/p/[slug] URL.
//
// All callers MUST verify auth before calling these — the helpers trust
// userId.

import "server-only";
import { customAlphabet } from "nanoid";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  computeIdeaValuation,
  type IdeaValuationInput,
  type IdeaValuationOutput,
} from "@/lib/idea-valuation";
import {
  computeEquitySplit,
  type FounderInput,
  type EquitySettings,
  type EquitySplitResult,
} from "@/lib/equity-split";
import {
  computeFundingPlan,
  type FundingPlanInput,
  type FundingPlanResult,
} from "@/lib/funding-plan";

// 12-char base58 slug for /s/p/[slug] (matches the score-slug entropy).
const SLUG_ALPHABET =
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const newPackSlug = customAlphabet(SLUG_ALPHABET, 12);

// -----------------------------------------------------------------------------
// idea_evaluations
// -----------------------------------------------------------------------------

export interface PersistIdeaEvalArgs {
  userId: string;
  inputs: IdeaValuationInput;
  ideaName?: string | null;
}

export interface PersistIdeaEvalResult {
  ok: boolean;
  id?: string;
  output?: IdeaValuationOutput;
  reason?: "not_configured" | "db_error";
}

export async function persistIdeaEvaluation(
  args: PersistIdeaEvalArgs,
): Promise<PersistIdeaEvalResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "not_configured" };

  const output = computeIdeaValuation(args.inputs);

  const { data, error } = await supabase
    .from("idea_evaluations")
    .insert({
      user_id: args.userId,
      idea_name: args.ideaName ?? null,
      inputs: args.inputs,
      valuation_low_aud: Math.round(output.lowAud),
      valuation_mid_aud: Math.round(output.midAud),
      valuation_high_aud: Math.round(output.highAud),
      factors: output.factors,
      suggestions: output.suggestions,
      confidence_text: output.confidence,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[blockid:idea-phase] idea_evaluations insert failed", error);
    return { ok: false, reason: "db_error" };
  }
  return { ok: true, id: data.id, output };
}

// -----------------------------------------------------------------------------
// equity_splits
// -----------------------------------------------------------------------------

export interface PersistEquitySplitArgs {
  userId: string;
  founders: FounderInput[];
  settings: EquitySettings;
}

export interface PersistEquitySplitResult {
  ok: boolean;
  id?: string;
  output?: EquitySplitResult;
  reason?: "not_configured" | "db_error";
}

export async function persistEquitySplit(
  args: PersistEquitySplitArgs,
): Promise<PersistEquitySplitResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "not_configured" };

  const output = computeEquitySplit(args.founders, args.settings);

  const { data, error } = await supabase
    .from("equity_splits")
    .insert({
      user_id: args.userId,
      founders: args.founders,
      settings: args.settings,
      allocations: output.allocations,
      reserves: output.reserves,
      flags: output.flags,
      vesting: output.vesting,
      total_points: output.totalPoints,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[blockid:idea-phase] equity_splits insert failed", error);
    return { ok: false, reason: "db_error" };
  }
  return { ok: true, id: data.id, output };
}

// -----------------------------------------------------------------------------
// funding_plans
// -----------------------------------------------------------------------------

export interface PersistFundingPlanArgs {
  userId: string;
  inputs: FundingPlanInput;
}

export interface PersistFundingPlanResult {
  ok: boolean;
  id?: string;
  output?: FundingPlanResult;
  reason?: "not_configured" | "db_error";
}

export async function persistFundingPlan(
  args: PersistFundingPlanArgs,
): Promise<PersistFundingPlanResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "not_configured" };

  const output = computeFundingPlan(args.inputs);

  const { data, error } = await supabase
    .from("funding_plans")
    .insert({
      user_id: args.userId,
      inputs: args.inputs,
      result: output,
      total_need_aud: Math.round(output.totalNeedAud),
      monthly_burn_aud: Math.round(output.monthlyBurnAud),
      recommended_raise: Math.round(output.recommended.raiseAud),
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[blockid:idea-phase] funding_plans insert failed", error);
    return { ok: false, reason: "db_error" };
  }
  return { ok: true, id: data.id, output };
}

// -----------------------------------------------------------------------------
// founder_packs — bundle the latest (or specified) eval / split / plan rows.
//
// Slug is 12-char base58 (same entropy as scores). Collisions are
// astronomically unlikely (~ 6e20 keyspace) but we wrap in a retry loop just
// in case the DB returns a unique-violation.
// -----------------------------------------------------------------------------

export interface MintFounderPackArgs {
  userId: string;
  evaluationId?: string | null;
  splitId?: string | null;
  fundingId?: string | null;
  ideaName?: string | null;
}

export interface MintFounderPackResult {
  ok: boolean;
  id?: string;
  slug?: string;
  reason?: "not_configured" | "no_artifacts" | "db_error";
}

export async function mintFounderPack(
  args: MintFounderPackArgs,
): Promise<MintFounderPackResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "not_configured" };

  if (!args.evaluationId && !args.splitId && !args.fundingId) {
    return { ok: false, reason: "no_artifacts" };
  }

  // Up to 3 attempts to dodge a (vanishingly unlikely) slug collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = newPackSlug();
    const { data, error } = await supabase
      .from("founder_packs")
      .insert({
        user_id: args.userId,
        slug,
        idea_name: args.ideaName ?? null,
        evaluation_id: args.evaluationId ?? null,
        split_id: args.splitId ?? null,
        funding_id: args.fundingId ?? null,
      })
      .select("id, slug")
      .single();
    if (data && !error) {
      return { ok: true, id: data.id, slug: data.slug };
    }
    // 23505 = unique_violation. Anything else, bail.
    const code = (error as { code?: string } | null)?.code;
    if (code !== "23505") {
      console.error("[blockid:idea-phase] founder_packs insert failed", error);
      return { ok: false, reason: "db_error" };
    }
  }
  return { ok: false, reason: "db_error" };
}

// -----------------------------------------------------------------------------
// Pack hydration — load a pack with its joined rows. Used by the share page,
// the PDF route, and the dashboard.
// -----------------------------------------------------------------------------

export interface HydratedFounderPack {
  id: string;
  slug: string;
  ideaName: string | null;
  createdAt: string;
  viewCount: number;
  lastViewedAt: string | null;
  evaluation: HydratedEvaluation | null;
  split: HydratedSplit | null;
  funding: HydratedFunding | null;
  user: { email: string; displayName: string | null };
}

export interface HydratedEvaluation {
  id: string;
  ideaName: string | null;
  inputs: IdeaValuationInput;
  valuationLowAud: number;
  valuationMidAud: number;
  valuationHighAud: number;
  factors: IdeaValuationOutput["factors"];
  suggestions: IdeaValuationOutput["suggestions"];
  confidenceText: string | null;
  aiNarrative: string | null;
  aiStrengths: string[] | null;
  aiRisks: string[] | null;
  createdAt: string;
}

export interface HydratedSplit {
  id: string;
  founders: FounderInput[];
  settings: EquitySettings;
  allocations: EquitySplitResult["allocations"];
  reserves: EquitySplitResult["reserves"];
  flags: EquitySplitResult["flags"];
  vesting: EquitySplitResult["vesting"];
  totalPoints: number | null;
  fairnessNarrative: string | null;
  createdAt: string;
}

export interface HydratedFunding {
  id: string;
  inputs: FundingPlanInput;
  result: FundingPlanResult;
  totalNeedAud: number | null;
  monthlyBurnAud: number | null;
  recommendedRaise: number | null;
  createdAt: string;
}

export async function hydrateFounderPackBySlug(
  slug: string,
): Promise<HydratedFounderPack | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data: pack, error } = await supabase
    .from("founder_packs")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    console.error("[blockid:idea-phase] founder_packs read failed", error);
    return null;
  }
  if (!pack) return null;

  const [evalRow, splitRow, fundingRow, userRow] = await Promise.all([
    pack.evaluation_id
      ? supabase
          .from("idea_evaluations")
          .select("*")
          .eq("id", pack.evaluation_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    pack.split_id
      ? supabase
          .from("equity_splits")
          .select("*")
          .eq("id", pack.split_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    pack.funding_id
      ? supabase
          .from("funding_plans")
          .select("*")
          .eq("id", pack.funding_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("app_users")
      .select("email, display_name")
      .eq("id", pack.user_id)
      .maybeSingle(),
  ]);

  return {
    id: pack.id,
    slug: pack.slug,
    ideaName: pack.idea_name,
    createdAt: pack.created_at,
    viewCount: pack.view_count,
    lastViewedAt: pack.last_viewed_at,
    user: {
      email: userRow.data?.email ?? "",
      displayName: userRow.data?.display_name ?? null,
    },
    evaluation: evalRow.data
      ? {
          id: evalRow.data.id,
          ideaName: evalRow.data.idea_name,
          inputs: evalRow.data.inputs,
          valuationLowAud: evalRow.data.valuation_low_aud,
          valuationMidAud: evalRow.data.valuation_mid_aud,
          valuationHighAud: evalRow.data.valuation_high_aud,
          factors: evalRow.data.factors,
          suggestions: evalRow.data.suggestions,
          confidenceText: evalRow.data.confidence_text,
          aiNarrative: evalRow.data.ai_narrative,
          aiStrengths: evalRow.data.ai_strengths,
          aiRisks: evalRow.data.ai_risks,
          createdAt: evalRow.data.created_at,
        }
      : null,
    split: splitRow.data
      ? {
          id: splitRow.data.id,
          founders: splitRow.data.founders,
          settings: splitRow.data.settings,
          allocations: splitRow.data.allocations,
          reserves: splitRow.data.reserves,
          flags: splitRow.data.flags,
          vesting: splitRow.data.vesting,
          totalPoints: splitRow.data.total_points,
          fairnessNarrative: splitRow.data.fairness_narrative,
          createdAt: splitRow.data.created_at,
        }
      : null,
    funding: fundingRow.data
      ? {
          id: fundingRow.data.id,
          inputs: fundingRow.data.inputs,
          result: fundingRow.data.result,
          totalNeedAud: fundingRow.data.total_need_aud,
          monthlyBurnAud: fundingRow.data.monthly_burn_aud,
          recommendedRaise: fundingRow.data.recommended_raise,
          createdAt: fundingRow.data.created_at,
        }
      : null,
  };
}

// -----------------------------------------------------------------------------
// View logging — append-only. Mirrors score_views.
// Returns the new view_count for convenience (the share page can render it).
// -----------------------------------------------------------------------------

export interface LogPackViewArgs {
  packId: string;
  ipHash?: string | null;
  userAgent?: string | null;
  referer?: string | null;
}

export async function logFounderPackView(
  args: LogPackViewArgs,
): Promise<number | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { error } = await supabase.from("founder_pack_views").insert({
    pack_id: args.packId,
    viewer_ip_hash: args.ipHash ?? null,
    viewer_ua: args.userAgent ?? null,
    referer: args.referer ?? null,
  });
  if (error) {
    console.error("[blockid:idea-phase] view insert failed", error);
    return null;
  }

  // Bump denormalised counter on the pack row. Best-effort; not transactional.
  const { data: pack } = await supabase
    .from("founder_packs")
    .select("view_count")
    .eq("id", args.packId)
    .maybeSingle();
  const next = (pack?.view_count ?? 0) + 1;
  await supabase
    .from("founder_packs")
    .update({ view_count: next, last_viewed_at: new Date().toISOString() })
    .eq("id", args.packId);
  return next;
}

// -----------------------------------------------------------------------------
// Dashboard queries — list rows for a given user.
// -----------------------------------------------------------------------------

export interface DashboardSummary {
  packs: Array<{
    id: string;
    slug: string;
    ideaName: string | null;
    viewCount: number;
    createdAt: string;
  }>;
  evaluations: Array<{
    id: string;
    ideaName: string | null;
    valuationMidAud: number;
    createdAt: string;
  }>;
  splits: Array<{
    id: string;
    founderCount: number;
    createdAt: string;
  }>;
  fundingPlans: Array<{
    id: string;
    totalNeedAud: number | null;
    recommendedRaise: number | null;
    createdAt: string;
  }>;
}

export async function loadDashboardSummary(
  userId: string,
): Promise<DashboardSummary> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { packs: [], evaluations: [], splits: [], fundingPlans: [] };
  }

  const [packs, evals, splits, plans] = await Promise.all([
    supabase
      .from("founder_packs")
      .select("id, slug, idea_name, view_count, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("idea_evaluations")
      .select("id, idea_name, valuation_mid_aud, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("equity_splits")
      .select("id, founders, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("funding_plans")
      .select("id, total_need_aud, recommended_raise, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return {
    packs: (packs.data ?? []).map((r) => ({
      id: r.id,
      slug: r.slug,
      ideaName: r.idea_name,
      viewCount: r.view_count,
      createdAt: r.created_at,
    })),
    evaluations: (evals.data ?? []).map((r) => ({
      id: r.id,
      ideaName: r.idea_name,
      valuationMidAud: r.valuation_mid_aud,
      createdAt: r.created_at,
    })),
    splits: (splits.data ?? []).map((r) => ({
      id: r.id,
      founderCount: Array.isArray(r.founders) ? r.founders.length : 0,
      createdAt: r.created_at,
    })),
    fundingPlans: (plans.data ?? []).map((r) => ({
      id: r.id,
      totalNeedAud: r.total_need_aud,
      recommendedRaise: r.recommended_raise,
      createdAt: r.created_at,
    })),
  };
}
