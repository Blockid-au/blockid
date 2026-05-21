// AI-powered equity and vesting recommendation engine (server-only).
//
// Uses callAI() with structured prompts to generate:
//   - Equity split suggestions (Slicing Pie + AU benchmarks)
//   - Vesting schedule recommendations (role-based)
//   - Share structure mode advice (fixed vs dynamic)
//   - ESOP pool sizing
//   - Comprehensive vesting reviews
//
// All recommendations are stored in ai_equity_recommendations table
// and charged via the credit system.

import "server-only";
import { callAI } from "./ai-client";
import { getSupabaseAdmin } from "./supabase";
import { spendCredits, canAfford } from "./credits";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FounderInput {
  name: string;
  role: string;          // CEO, CTO, COO, CMO, Designer, Domain Expert
  timeCommitment: string; // full_time_now, full_time_3mo, part_time, advisor
  cashContributed: number;
  ideaOriginator: boolean;
  sweatMonths: number;
  ipAssets: number;
  riskLevel: string;     // quit_job, has_runway, side_project
}

export interface EquitySplitRecommendation {
  allocations: Array<{
    name: string;
    role: string;
    suggestedPct: number;
    rationale: string;
    vestingMonths: number;
    cliffMonths: number;
  }>;
  esopPct: number;
  esopRationale: string;
  benchmarkNote: string;
  warnings: string[];
  confidence: number;
}

export interface VestingRecommendation {
  vestingMonths: number;
  cliffMonths: number;
  vestingType: string;
  singleTrigger: boolean;
  doubleTrigger: boolean;
  rationale: string;
  industryComparison: string;
  warnings: string[];
}

export interface ShareStructureRecommendation {
  recommendedMode: "fixed_shares" | "dynamic_shares";
  authorizedShares: number;
  nominalPrice: number | null;
  rationale: string;
  stageAdvice: string;
  warnings: string[];
}

export interface ESOPRecommendation {
  poolPct: number;
  poolShares: number;
  rationale: string;
  hiringPlanAdvice: string;
  benchmarkNote: string;
}

export interface ComprehensiveReview {
  overallHealth: string; // excellent, good, fair, needs_attention
  score: number;         // 0-100
  equityAssessment: string;
  vestingAssessment: string;
  esopAssessment: string;
  shareStructureAssessment: string;
  recommendations: string[];
  risks: string[];
  nextSteps: string[];
}

// ---------------------------------------------------------------------------
// AI Equity Split Suggestion
// ---------------------------------------------------------------------------

export async function aiSuggestEquitySplit(params: {
  userId: string;
  accountId: string;
  founders: FounderInput[];
  sviScore: number;
  stage: number;
  valuationAud: number;
  startupName: string;
}): Promise<{ ok: boolean; recommendation?: EquitySplitRecommendation; error?: string }> {
  const afford = await canAfford(params.userId, "ai_equity_split");
  if (!afford.allowed) {
    return { ok: false, error: afford.reason ?? "insufficient_credits" };
  }

  const system = `You are BlockID's AI equity advisor for Australian startups.

Australian equity benchmarks:
- Seed-stage founder equity: 60-80% for sole founder, 45-55% for CEO with co-founder
- ESOP pool: 10-15% is standard for AU seed stage
- Advisor equity: 0.5-2% with 24-month vesting, 3-month cliff
- Co-founder: 15-35% depending on contribution, with 4-year vesting, 1-year cliff
- Investors: No vesting (immediate)

The startup "${params.startupName}" has SVI score ${params.sviScore} (stage ${params.stage}), valued at ~A$${params.valuationAud.toLocaleString()}.

Analyze the founders' contributions and suggest an optimal equity split.
Output ONLY valid JSON matching this exact schema (no markdown, no explanation outside JSON):
{
  "allocations": [{ "name": string, "role": string, "suggestedPct": number, "rationale": string, "vestingMonths": number, "cliffMonths": number }],
  "esopPct": number,
  "esopRationale": string,
  "benchmarkNote": string,
  "warnings": [string],
  "confidence": number (0-100)
}`;

  const user = `Founders:\n${params.founders.map((f, i) => `${i + 1}. ${f.name} — Role: ${f.role}, Time: ${f.timeCommitment}, Cash: A$${f.cashContributed}, Idea originator: ${f.ideaOriginator}, Sweat months: ${f.sweatMonths}, IP assets: ${f.ipAssets}, Risk: ${f.riskLevel}`).join("\n")}`;

  try {
    const result = await callAI({ system, user, maxTokens: 2000 });
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ok: false, error: "AI returned non-JSON response" };

    const recommendation = JSON.parse(jsonMatch[0]) as EquitySplitRecommendation;

    await spendCredits(params.userId, "ai_equity_split", {
      accountId: params.accountId,
      founders: params.founders.length,
    });

    await storeRecommendation(params.accountId, params.userId, "equity_split", {
      founders: params.founders,
      sviScore: params.sviScore,
      stage: params.stage,
    }, recommendation, 1.00);

    return { ok: true, recommendation };
  } catch (err) {
    console.error("[ai-equity] split suggestion failed", err);
    return { ok: false, error: "AI recommendation failed" };
  }
}

// ---------------------------------------------------------------------------
// AI Vesting Schedule Suggestion
// ---------------------------------------------------------------------------

export async function aiSuggestVestingSchedule(params: {
  userId: string;
  accountId: string;
  shareholderName: string;
  role: string;
  equityPct: number;
  sviScore: number;
  stage: number;
}): Promise<{ ok: boolean; recommendation?: VestingRecommendation; error?: string }> {
  const afford = await canAfford(params.userId, "ai_vesting");
  if (!afford.allowed) {
    return { ok: false, error: afford.reason ?? "insufficient_credits" };
  }

  const system = `You are BlockID's vesting schedule advisor for Australian startups.

Standard AU vesting by role:
- Founder: 48 months, 12-month cliff, linear, double-trigger acceleration
- Co-founder: 48 months, 12-month cliff, linear, double-trigger acceleration
- Advisor: 24 months, 3-month cliff, linear, no acceleration
- Employee/ESOP: 48 months, 12-month cliff, linear, double-trigger acceleration
- Investor: 0 months (immediate vesting)

The startup has SVI score ${params.sviScore} (stage ${params.stage}).

Output ONLY valid JSON:
{
  "vestingMonths": number,
  "cliffMonths": number,
  "vestingType": "linear" | "back_weighted" | "front_weighted" | "milestone",
  "singleTrigger": boolean,
  "doubleTrigger": boolean,
  "rationale": string,
  "industryComparison": string,
  "warnings": [string]
}`;

  const user = `Shareholder: ${params.shareholderName}, Role: ${params.role}, Equity: ${params.equityPct}%`;

  try {
    const result = await callAI({ system, user, maxTokens: 1000 });
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ok: false, error: "AI returned non-JSON response" };

    const recommendation = JSON.parse(jsonMatch[0]) as VestingRecommendation;

    await spendCredits(params.userId, "ai_vesting", {
      accountId: params.accountId,
      shareholderName: params.shareholderName,
    });

    await storeRecommendation(params.accountId, params.userId, "vesting_schedule", {
      shareholderName: params.shareholderName,
      role: params.role,
      equityPct: params.equityPct,
    }, recommendation, 0.50);

    return { ok: true, recommendation };
  } catch (err) {
    console.error("[ai-equity] vesting suggestion failed", err);
    return { ok: false, error: "AI recommendation failed" };
  }
}

// ---------------------------------------------------------------------------
// AI Share Structure Mode Suggestion
// ---------------------------------------------------------------------------

export async function aiSuggestShareStructure(params: {
  userId: string;
  accountId: string;
  sviScore: number;
  stage: number;
  valuationAud: number;
  currentAuthorizedShares: number;
}): Promise<{ ok: boolean; recommendation?: ShareStructureRecommendation; error?: string }> {
  const afford = await canAfford(params.userId, "ai_share_structure");
  if (!afford.allowed) {
    return { ok: false, error: afford.reason ?? "insufficient_credits" };
  }

  const system = `You are BlockID's share structure advisor for Australian startups.

Two modes:
- fixed_shares: Total authorized shares constant (e.g. 10M), price per share floats with SVI/valuation. Best for pre-seed/seed.
- dynamic_shares: Price per share fixed at nominal (e.g. A$0.001), total shares increase with valuation. Best for growth-stage.

SVI: ${params.sviScore}, Stage: ${params.stage}, Valuation: A$${params.valuationAud.toLocaleString()}, Current authorized: ${params.currentAuthorizedShares.toLocaleString()}.

Output ONLY valid JSON:
{
  "recommendedMode": "fixed_shares" | "dynamic_shares",
  "authorizedShares": number,
  "nominalPrice": number | null,
  "rationale": string,
  "stageAdvice": string,
  "warnings": [string]
}`;

  const user = `Please recommend the optimal share structure for this startup.`;

  try {
    const result = await callAI({ system, user, maxTokens: 1000 });
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ok: false, error: "AI returned non-JSON response" };

    const recommendation = JSON.parse(jsonMatch[0]) as ShareStructureRecommendation;

    await spendCredits(params.userId, "ai_share_structure", {
      accountId: params.accountId,
    });

    await storeRecommendation(params.accountId, params.userId, "share_structure", {
      sviScore: params.sviScore,
      stage: params.stage,
      valuationAud: params.valuationAud,
    }, recommendation, 0.75);

    return { ok: true, recommendation };
  } catch (err) {
    console.error("[ai-equity] share structure suggestion failed", err);
    return { ok: false, error: "AI recommendation failed" };
  }
}

// ---------------------------------------------------------------------------
// AI ESOP Pool Suggestion
// ---------------------------------------------------------------------------

export async function aiSuggestESOPPool(params: {
  userId: string;
  accountId: string;
  sviScore: number;
  stage: number;
  currentTeamSize: number;
  authorizedShares: number;
  hiringPlan?: string;
}): Promise<{ ok: boolean; recommendation?: ESOPRecommendation; error?: string }> {
  const afford = await canAfford(params.userId, "ai_esop");
  if (!afford.allowed) {
    return { ok: false, error: afford.reason ?? "insufficient_credits" };
  }

  const system = `You are BlockID's ESOP advisor for Australian startups.

AU ESOP benchmarks:
- Pre-seed: 8-12% pool
- Seed: 10-15% pool
- Series A: 12-18% pool
- Standard grants: CTO 2-5%, VP 1-2%, Senior engineer 0.5-1%, Junior 0.1-0.25%

SVI: ${params.sviScore}, Stage: ${params.stage}, Team size: ${params.currentTeamSize}, Authorized shares: ${params.authorizedShares.toLocaleString()}.

Output ONLY valid JSON:
{
  "poolPct": number,
  "poolShares": number,
  "rationale": string,
  "hiringPlanAdvice": string,
  "benchmarkNote": string
}`;

  const user = params.hiringPlan
    ? `Hiring plan: ${params.hiringPlan}`
    : `No specific hiring plan provided. Suggest based on stage and team size.`;

  try {
    const result = await callAI({ system, user, maxTokens: 1000 });
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ok: false, error: "AI returned non-JSON response" };

    const recommendation = JSON.parse(jsonMatch[0]) as ESOPRecommendation;

    await spendCredits(params.userId, "ai_esop", { accountId: params.accountId });

    await storeRecommendation(params.accountId, params.userId, "esop_pool", {
      teamSize: params.currentTeamSize,
      sviScore: params.sviScore,
    }, recommendation, 0.50);

    return { ok: true, recommendation };
  } catch (err) {
    console.error("[ai-equity] ESOP suggestion failed", err);
    return { ok: false, error: "AI recommendation failed" };
  }
}

// ---------------------------------------------------------------------------
// AI Comprehensive Vesting Review
// ---------------------------------------------------------------------------

export async function aiComprehensiveReview(params: {
  userId: string;
  accountId: string;
  sviScore: number;
  stage: number;
  valuationAud: number;
  shareholders: Array<{ name: string; role: string; pct: number; vestingMonths?: number; cliffMonths?: number }>;
  esopPct: number;
  shareMode: string;
}): Promise<{ ok: boolean; recommendation?: ComprehensiveReview; error?: string }> {
  const afford = await canAfford(params.userId, "ai_vesting_review");
  if (!afford.allowed) {
    return { ok: false, error: afford.reason ?? "insufficient_credits" };
  }

  const system = `You are BlockID's senior equity advisor conducting a comprehensive vesting and equity review for an Australian startup.

Review all aspects: equity split fairness, vesting terms, ESOP adequacy, share structure appropriateness, governance health.

SVI: ${params.sviScore}, Stage: ${params.stage}, Valuation: A$${params.valuationAud.toLocaleString()}.
ESOP pool: ${params.esopPct}%, Share mode: ${params.shareMode}.

Output ONLY valid JSON:
{
  "overallHealth": "excellent" | "good" | "fair" | "needs_attention",
  "score": number (0-100),
  "equityAssessment": string,
  "vestingAssessment": string,
  "esopAssessment": string,
  "shareStructureAssessment": string,
  "recommendations": [string],
  "risks": [string],
  "nextSteps": [string]
}`;

  const user = `Shareholders:\n${params.shareholders.map((s, i) => `${i + 1}. ${s.name} — ${s.role}, ${s.pct}%, Vesting: ${s.vestingMonths ?? "none"}mo, Cliff: ${s.cliffMonths ?? "none"}mo`).join("\n")}`;

  try {
    const result = await callAI({ system, user, maxTokens: 2000 });
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ok: false, error: "AI returned non-JSON response" };

    const recommendation = JSON.parse(jsonMatch[0]) as ComprehensiveReview;

    await spendCredits(params.userId, "ai_vesting_review", {
      accountId: params.accountId,
    });

    await storeRecommendation(params.accountId, params.userId, "comprehensive_review", {
      shareholders: params.shareholders,
      esopPct: params.esopPct,
    }, recommendation, 1.50);

    return { ok: true, recommendation };
  } catch (err) {
    console.error("[ai-equity] comprehensive review failed", err);
    return { ok: false, error: "AI recommendation failed" };
  }
}

// ---------------------------------------------------------------------------
// AI Ticker Suggestion (free — included in token creation)
// ---------------------------------------------------------------------------

export async function aiSuggestTicker(params: {
  startupName: string;
  existingTickers: string[];
}): Promise<{ suggestions: Array<{ ticker: string; rationale: string; available: boolean }> }> {
  const system = `You are a stock ticker naming expert. Suggest 3 NASDAQ/ASX-style ticker symbols.

Rules:
- 3-4 uppercase letters only (A-Z)
- Intuitive abbreviation of the company name
- Follow patterns like: Apple→AAPL, Google→GOOG, Meta→META, Atlassian→TEAM
- Must NOT be: ${["BID", "ETH", "BTC", "USDT", "USDC", ...params.existingTickers].join(", ")}

Output ONLY valid JSON array:
[{ "ticker": string, "rationale": string, "available": true }]`;

  const user = `Company name: "${params.startupName}"`;

  try {
    const result = await callAI({ system, user, maxTokens: 500 });
    const jsonMatch = result.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { suggestions: [] };
    const suggestions = JSON.parse(jsonMatch[0]);
    return { suggestions };
  } catch {
    return { suggestions: [] };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function storeRecommendation(
  accountId: string,
  _userId: string,
  type: string,
  inputContext: Record<string, unknown>,
  recommendation: unknown,
  creditsCharged: number,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  await supabase.from("ai_equity_recommendations").insert({
    account_id: accountId,
    recommendation_type: type,
    input_context: inputContext,
    recommendation,
    credits_charged: creditsCharged,
    status: "pending",
  });
}
