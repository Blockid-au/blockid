// module-precompute — deterministic module outputs per dimension, computed
// once per report from the SVI signals / criterion scores / gather results
// and handed to (a) the W4 owner prompt as the compact MODULES block and
// (b) `generateChartsV2`, whose number-provenance pass only accepts series
// values that appear here or in the evidence rows (spec §C.2 / §C.4 / §C.11).
//
// Every entry is `{ id, output }` where `id` names the module (file:function)
// so the chapter appendix and the prompt can cite it as [module:<id>].
// Pure: no I/O, no LLM. Modules that need inputs the context does not carry
// (Stripe MRR series, cap-table register, tech audit numbers) are simply
// absent — the visuals then fall back to benchmark_only / target states.
//
// Financial input assertions are not measured observations. Revenue-derived
// funding readiness and Rule of 40 remain unavailable until source qualification.

import { auMarketProfile } from "@/lib/agents/cfo-tam-sam-som";
import { scoreEsop, type GovernanceHealth } from "@/lib/agents/cfo-esop-scoring";
import { calculateComplianceScore } from "@/lib/agents/clo-compliance";
import { evaluateAntlerSignals } from "@/lib/agents/antler-signals";
import type { CriterionKey } from "@/lib/evaluation-criteria";
import type { SVIExtractedSignals } from "@/lib/svi-analysis";
import { benchmarkFor, benchmarkStageForSvi, DIM_ORDER, type DimKey } from "./dimension-owners";
import type { ReportContext } from "./types";

export interface ModuleOutput {
  id: string;
  output: Record<string, unknown>;
}

export type ModuleOutputsByDim = Partial<Record<DimKey, ModuleOutput[]>>;

function dimScore(ctx: ReportContext, dim: DimKey): number | null {
  const fromMap = ctx.sviAnalysis.dimensionScores?.[dim];
  if (typeof fromMap === "number" && Number.isFinite(fromMap)) return Math.round(fromMap);
  const sub = ctx.sviAnalysis.subs?.find((s) => s.key === dim);
  return sub && Number.isFinite(sub.value) ? Math.round(sub.value) : null;
}

function criterionScore(ctx: ReportContext, key: CriterionKey): number | null {
  const r = ctx.criterionResults.get(key);
  if (r && Number.isFinite(r.score)) return Math.round(r.score);
  const ai = ctx.criteriaData[key]?.aiScore;
  return typeof ai === "number" && Number.isFinite(ai) ? Math.round(ai) : null;
}

function signalsOf(ctx: ReportContext): SVIExtractedSignals | null {
  const s = ctx.sviAnalysis.signals;
  return s && typeof s === "object" ? s : null;
}

function gatherOf(ctx: ReportContext): NonNullable<ReportContext["gatherResults"]> {
  return ctx.gatherResults ?? {};
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** S-R5: latest GA4 90-day snapshot → AARRR funnel numbers (TRE) — only when a snapshot exists. */
function ga4FunnelModule(ctx: ReportContext): ModuleOutput | null {
  const g = gatherOf(ctx).ga4;
  if (!g || typeof g !== "object") return null;
  const funnel = (g.funnel ?? {}) as Record<string, unknown>;
  const sessions = numOrNull(g.sessions);
  if (sessions === null) return null;
  return {
    id: "oauth-ga4-signals.ts:aarrrFunnel",
    output: {
      windowDays: numOrNull(g.windowDays) ?? 90,
      sessions,
      engagedSessions: numOrNull(g.engagedSessions) ?? numOrNull(funnel.activation) ?? 0,
      returningUsers: numOrNull(g.returningUsers) ?? numOrNull(funnel.retention) ?? 0,
      conversions: numOrNull(g.conversions) ?? numOrNull(funnel.revenue) ?? 0,
      newUsers: numOrNull(g.newUsers) ?? 0,
      returningSharePct: Math.round((numOrNull(g.returningShare) ?? 0) * 100),
      engagementRatePct: Math.round((numOrNull(g.engagementRate) ?? 0) * 100),
      conversionRatePct: Math.round((numOrNull(g.conversionRate) ?? 0) * 1000) / 10,
      avgSessionDurationSec: numOrNull(g.avgSessionDurationSec) ?? 0,
      takenAt: typeof g.takenAt === "string" ? g.takenAt : null,
    },
  };
}

/** S-R5: latest GA4 snapshot → top-3 channel mix (MPC). */
function ga4ChannelModule(ctx: ReportContext): ModuleOutput | null {
  const g = gatherOf(ctx).ga4;
  if (!g || !Array.isArray(g.topChannels) || g.topChannels.length === 0) return null;
  const output: Record<string, unknown> = { sessions: numOrNull(g.sessions) ?? 0, channels: g.topChannels.length };
  (g.topChannels as Array<{ channel?: string; sessions?: number; share?: number }>).slice(0, 3).forEach((c, i) => {
    output[`channel${i + 1}`] = c.channel ?? "(other)";
    output[`channel${i + 1}Sessions`] = numOrNull(c.sessions) ?? 0;
    output[`channel${i + 1}SharePct`] = Math.round((numOrNull(c.share) ?? 0) * 100);
  });
  return { id: "oauth-ga4-signals.ts:channelMix", output };
}

/** S-R5: parsed LinkedIn export / URL → founder signals (FTV). */
function founderSignalsModule(ctx: ReportContext): ModuleOutput | null {
  const f = gatherOf(ctx).founderSignals;
  if (!f || typeof f !== "object") return null;
  const output: Record<string, unknown> = { source: String(f.source ?? "linkedin_text"), confidence: numOrNull(f.confidence) ?? 0 };
  if (numOrNull(f.yearsExperience) !== null) output.yearsExperience = f.yearsExperience;
  if (numOrNull(f.yearsInDomain) !== null) output.yearsInDomain = f.yearsInDomain;
  if (numOrNull(f.priorCompanies) !== null) output.priorCompanies = f.priorCompanies;
  if (numOrNull(f.exits) !== null) output.exits = f.exits;
  if (numOrNull(f.teamSizeOnPage) !== null) output.teamSizeOnPage = f.teamSizeOnPage;
  if (typeof f.currentRole === "string") output.currentRole = f.currentRole;
  if (typeof f.profileUrl === "string") output.profileUrl = f.profileUrl;
  return { id: "connectors/linkedin-upload.ts:founderSignals", output };
}

/** Module id the FTV chapter renderer looks for to draw the "Founder Execution" card (G14-S37). */
export const FOUNDER_EXECUTION_MODULE_ID = "founder/execution.ts:founderExecutionSignals";

/**
 * G14-S37: the founder execution rubric. Prefers the GATHER result (scored
 * with evaluator flags + LinkedIn agreement); falls back to the summary the
 * SVI signals carry when the analysis was scored with a profile.
 */
function founderExecutionModule(ctx: ReportContext): ModuleOutput | null {
  const g = gatherOf(ctx).founderExecution;
  if (g && typeof g === "object" && numOrNull(g.executionScore) !== null) {
    const breakdown = Array.isArray(g.breakdown) ? (g.breakdown as Array<Record<string, unknown>>) : [];
    const output: Record<string, unknown> = {
      executionScore: Math.round(numOrNull(g.executionScore) ?? 0),
      rawScore: Math.round(numOrNull(g.rawScore) ?? 0),
      capped: g.capped === true,
      structured: g.structured === true,
      rubricVersion: String(g.rubricVersion ?? "1.0"),
      breakdown: breakdown.map((b) => ({ key: String(b.key ?? ""), label: String(b.label ?? b.key ?? ""), points: numOrNull(b.points) ?? 0, max: numOrNull(b.max) ?? 0, evidence: String(b.evidence ?? ""), source: String(b.source ?? "founder") })),
    };
    if (typeof g.capReason === "string" && g.capReason) output.capReason = g.capReason;
    if (typeof g.capLiftedBy === "string" && g.capLiftedBy) output.capLiftedBy = g.capLiftedBy;
    for (const b of output.breakdown as Array<{ key: string; points: number }>) if (b.key) output[`${b.key}Points`] = b.points;
    return { id: FOUNDER_EXECUTION_MODULE_ID, output };
  }
  const s = signalsOf(ctx);
  const fe = s?.founderExecution;
  if (!fe || typeof fe !== "object") return null;
  const output: Record<string, unknown> = {
    executionScore: Math.round(fe.score),
    rawScore: Math.round(fe.rawScore),
    capped: fe.capped === true,
    structured: true,
    rubricVersion: fe.rubricVersion,
    breakdown: fe.breakdown.map((b) => ({ key: b.key, label: b.key.replace(/_/g, " "), points: b.points, max: b.max, evidence: b.evidence, source: "founder" })),
  };
  if (fe.capReason) output.capReason = fe.capReason;
  for (const b of fe.breakdown) output[`${b.key}Points`] = b.points;
  return { id: FOUNDER_EXECUTION_MODULE_ID, output };
}

/** S-R5: cap-table register (gather.ts capTable) → real split for the CGH donut + the esop bridge. */
function capTableModule(ctx: ReportContext): ModuleOutput | null {
  const c = gatherOf(ctx).capTable;
  if (!c || typeof c !== "object") return null;
  const founderPct = numOrNull(c.founderPct);
  const esopPct = numOrNull(c.esopPct);
  const investorPct = numOrNull(c.investorPct);
  if (founderPct === null && esopPct === null && investorPct === null) return null;
  return {
    id: "report-pipeline/gather.ts:capTable",
    output: {
      holders: numOrNull(c.holders) ?? 0,
      founderPct: founderPct ?? 0,
      esopPct: esopPct ?? 0,
      investorPct: investorPct ?? 0,
      vestingFlag: c.vestingFlag === true,
      fullyDilutedShares: numOrNull(c.fullyDilutedShares) ?? 0,
    },
  };
}

/** Benchmark + deterministic score row every chapter carries. */
function benchmarkModule(ctx: ReportContext, dim: DimKey): ModuleOutput {
  const stage = benchmarkStageForSvi(ctx.stage);
  const b = benchmarkFor(dim, stage);
  return {
    id: "report-pipeline/dimension-owners.ts:benchmarkFor",
    output: { dim, benchmarkStage: stage, p25: b.p25, p50: b.p50, p75: b.p75, deterministicScore: dimScore(ctx, dim) },
  };
}

function criterionModule(ctx: ReportContext, keys: CriterionKey[]): ModuleOutput | null {
  const output: Record<string, unknown> = {};
  keys.forEach((k) => {
    const v = criterionScore(ctx, k);
    if (v !== null) output[k] = v;
  });
  return Object.keys(output).length ? { id: "svi-analysis.ts:criterionScores", output } : null;
}

// ── Per-dimension builders ──────────────────────────────────────────────────

function treModules(ctx: ReportContext): ModuleOutput[] {
  const out: ModuleOutput[] = [];
  const s = signalsOf(ctx);
  if (s) {
    const output: Record<string, unknown> = {
      financialStatus: "unqualified",
      financialNote: "Revenue extracted from the original input is a founder assertion, not a source-qualified financial fact.",
      hasCustomers: s.hasCustomers,
      hasAnalytics: s.hasAnalytics,
    };
    if (typeof s.pilotCount === "number") output.pilotCount = s.pilotCount;
    out.push({ id: "svi-analysis.ts:extractSignals(traction)", output });
    // Stated growth/margin do not establish compatible verified periods or units.
    // A qualified financial producer is required before publishing Rule of 40.

  }
  const ga4 = ga4FunnelModule(ctx);
  if (ga4) out.push(ga4);
  const c = criterionModule(ctx, ["customer_size", "revenue", "market", "gtm_strategy"]);
  if (c) out.push(c);
  return out;
}

function mpcModules(ctx: ReportContext): ModuleOutput[] {
  const out: ModuleOutput[] = [];
  const sector = ctx.sviAnalysis.sector ?? signalsOf(ctx)?.sector;
  const profile = auMarketProfile(sector);
  out.push({
    id: "agents/cfo-tam-sam-som.ts:auMarketProfile",
    output: {
      sector: sector ?? "default",
      reachableUnits: profile.reachableUnits,
      unitLabel: profile.unitLabel,
      cagrPct: profile.cagrPct,
      captureRatePct: profile.captureRatePct,
      expansionMultiplier: profile.expansionMultiplier,
      sourceCount: profile.sources.length,
    },
  });
  const s = signalsOf(ctx);
  if (s) {
    out.push({
      id: "svi-analysis.ts:extractSignals(market)",
      output: { marketSize: s.marketSize, problemClarity: s.problemClarity, hasCustomerInterviews: s.hasCustomerInterviews },
    });
  }
  const mix = ga4ChannelModule(ctx);
  if (mix) out.push(mix);
  const c = criterionModule(ctx, ["market", "gtm_strategy", "idea", "website"]);
  if (c) out.push(c);
  return out;
}

function ftvModules(ctx: ReportContext): ModuleOutput[] {
  const out: ModuleOutput[] = [];
  const s = signalsOf(ctx);
  if (s) {
    try {
      const antler = evaluateAntlerSignals({ analysis: ctx.sviAnalysis, signals: s, rawText: ctx.rawText, ci: ctx.sviAnalysis.competitiveIntelligence ?? null });
      const output: Record<string, unknown> = { progressionScore: Math.round(antler.progressionScore) };
      antler.signals.forEach((sig) => {
        output[sig.key] = Math.round(sig.score);
      });
      if (antler.standout) output.standout = antler.standout.label;
      if (antler.weakestLink) output.weakestLink = antler.weakestLink.label;
      out.push({ id: "agents/antler-signals.ts:evaluateAntlerSignals", output });
    } catch {
      // Antler evaluation is best-effort; the chapter still has criterion scores.
    }
    out.push({
      id: "svi-analysis.ts:extractSignals(founder)",
      output: { hasCoFounder: s.hasCoFounder, founderExperience: s.founderExperience, founderSectorFit: s.founderSectorFit, hasAdvisors: s.hasAdvisors },
    });
  }
  const founder = founderSignalsModule(ctx);
  if (founder) out.push(founder);
  const execution = founderExecutionModule(ctx);
  if (execution) out.push(execution);
  const c = criterionModule(ctx, ["founder_profile", "team", "team_structure"]);
  if (c) out.push(c);
  return out;
}

function ptdModules(ctx: ReportContext): ModuleOutput[] {
  const out: ModuleOutput[] = [];
  const s = signalsOf(ctx);
  if (s) {
    out.push({
      id: "svi-analysis.ts:extractSignals(product)",
      output: { hasProduct: s.hasProduct, hasDemo: s.hasDemo, hasSourceCode: s.hasSourceCode, hasWebsite: s.hasWebsite, hasApp: s.hasApp, isAIWrapper: s.isAIWrapper },
    });
  }
  const gr = ctx.gatherResults;
  if (gr.techAudit) out.push({ id: "report-pipeline/orchestrator.ts:gather(techAudit)", output: flatNumbers(gr.techAudit) });
  if (gr.repoAudit) out.push({ id: "report-pipeline/orchestrator.ts:gather(repoAudit)", output: flatNumbers(gr.repoAudit) });
  const c = criterionModule(ctx, ["code_git", "website", "roadmap"]);
  if (c) out.push(c);
  return out;
}

function cghModules(ctx: ReportContext): ModuleOutput[] {
  const out: ModuleOutput[] = [];
  const s = signalsOf(ctx);
  // S-R5: the equity register (when the founder has one) replaces the
  // "12 % AU norm" assumption in the esop bridge and gives the donut real slices.
  const register = capTableModule(ctx);
  const regOut = register?.output as { esopPct?: number; vestingFlag?: boolean } | undefined;
  const registerEsopPct = regOut && typeof regOut.esopPct === "number" && regOut.esopPct > 0 ? regOut.esopPct : null;
  if (s) {
    const governance: GovernanceHealth = {
      esop:
        registerEsopPct !== null
          ? { poolCreated: true, poolPct: registerEsopPct, grantsIssued: false, grantCount: 0, founderVestingInPlace: s.hasVesting || regOut?.vestingFlag === true, legalDeedSigned: false, strikePrice: 0, vestingMonths: 48, cliffMonths: 12 }
          : s.esopAllocated
            ? { poolCreated: true, poolPct: 12, grantsIssued: false, grantCount: 0, founderVestingInPlace: s.hasVesting, legalDeedSigned: false, strikePrice: 0, vestingMonths: 48, cliffMonths: 12 }
            : null,
      hasShareholdersAgreement: s.hasShareholdersAgreement,
      hasFounderVesting: s.hasVesting || regOut?.vestingFlag === true,
      boardMeetingsPerYear: s.hasBoardCadence ? 12 : 0,
      hasDataRoom: s.hasDataRoom,
      dataRoomPct: s.hasDataRoom ? 60 : 0,
      hasInvestorNDA: false,
      hasIpAssignment: s.hasIPProtection,
    };
    const esop = scoreEsop(governance);
    out.push({
      id: "agents/cfo-esop-scoring.ts:scoreEsop",
      output: {
        esopScore: Math.round(esop.score),
        sviContribution: esop.sviContribution,
        valuationMultiplier: esop.valuationMultiplier,
        issues: esop.issues.length,
        criticalIssues: esop.issues.filter((i) => i.severity === "critical").length,
        topAction: esop.actions[0]?.action ?? null,
        esopAssumed: registerEsopPct !== null ? `register: ESOP ${registerEsopPct} %` : s.esopAllocated ? "pool declared; 12 % AU norm assumed, no register" : "no pool declared",
      },
    });
    if (register) out.push(register);
    out.push({
      id: "svi-analysis.ts:extractSignals(governance)",
      output: { hasCapTable: s.hasCapTable, hasVesting: s.hasVesting, hasShareholdersAgreement: s.hasShareholdersAgreement, hasBoardCadence: s.hasBoardCadence, esopAllocated: s.esopAllocated },
    });
  }
  const c = criterionModule(ctx, ["team", "dataroom", "team_structure"]);
  if (c) out.push(c);
  return out;
}

function iriModules(ctx: ReportContext): ModuleOutput[] {
  const out: ModuleOutput[] = [];
  const s = signalsOf(ctx);
  if (s) {
    out.push({
      id: "agents/cro-funding-readiness.ts:scoreFundingReadiness",
      output: { status: "unavailable", reason: "Funding readiness needs qualified financial inputs. Missing revenue must not be scored as zero." },
    });
    out.push({
      id: "svi-analysis.ts:extractSignals(investor)",
      output: { hasPitchDeck: s.hasPitchDeck, hasFinancialModel: s.hasFinancialModel, hasDataRoom: s.hasDataRoom, raiseMentioned: s.raiseMentioned },
    });
  }
  const c = criterionModule(ctx, ["documents", "dataroom", "revenue"]);
  if (c) out.push(c);
  return out;
}

function lcoModules(ctx: ReportContext): ModuleOutput[] {
  const out: ModuleOutput[] = [];
  const s = signalsOf(ctx);
  if (s) {
    const completed: string[] = [];
    if (s.hasABN) completed.push("abn", "acn");
    if (s.hasIPProtection) completed.push("ip_assignment", "trademark");
    if (s.hasShareholdersAgreement) completed.push("sha");
    if (s.hasVesting) completed.push("vesting");
    if (s.esopAllocated) completed.push("esop");
    if (s.hasLegalDocs) completed.push("constitution", "terms", "privacy_policy");
    if (s.hasCapTable) completed.push("cap_table");
    if (s.hasDataRoom) completed.push("data_room");
    const ca = calculateComplianceScore(Math.max(0, Math.min(4, ctx.stage)), completed);
    out.push({
      id: "agents/clo-compliance.ts:calculateComplianceScore",
      output: {
        complianceScore: ca.score,
        itemsRelevant: ca.items.length,
        itemsCompleted: ca.completed.length,
        missingCritical: ca.missingCritical.map((i) => i.id).slice(0, 6),
        nextStep: ca.nextSteps[0] ?? null,
        completedIds: completed,
      },
    });
    out.push({
      id: "svi-analysis.ts:extractSignals(legal)",
      output: { hasABN: s.hasABN, hasIPProtection: s.hasIPProtection, hasContracts: s.hasContracts, hasLegalDocs: s.hasLegalDocs },
    });
  }
  const c = criterionModule(ctx, ["documents"]);
  if (c) out.push(c);
  return out;
}

function svmModules(ctx: ReportContext): ModuleOutput[] {
  const out: ModuleOutput[] = [];
  const s = signalsOf(ctx);
  if (s) {
    // 5-factor moat, deterministic from the extracted signals (0 / 50 / 100 per factor).
    const factors = {
      networkEffects: s.hasNetworkEffect ? 100 : 0,
      switchingCosts: s.hasSwitchingCosts ? 100 : 0,
      brand: s.hasSocialProof ? 60 : 20,
      proprietaryData: s.hasDataAdvantage ? 100 : 0,
      economiesOfScale: s.hasProduct && s.hasCustomers ? 50 : 20,
    };
    const moatScore = Math.round(Object.values(factors).reduce((a, b) => a + b, 0) / 5);
    out.push({ id: "report-pipeline/module-precompute.ts:fiveFactorMoat", output: { ...factors, moatScore, hasMoat: s.hasMoat, isAIWrapper: s.isAIWrapper } });
  }
  const c = criterionModule(ctx, ["roadmap", "idea"]);
  if (c) out.push(c);
  return out;
}

/** Numeric / boolean / short-string leaves of a gather result, one level deep. */
function flatNumbers(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string" && v.length <= 60) out[k] = v;
  });
  return out;
}

const BUILDERS: Record<DimKey, (ctx: ReportContext) => ModuleOutput[]> = {
  tre: treModules,
  mpc: mpcModules,
  ftv: ftvModules,
  ptd: ptdModules,
  cgh: cghModules,
  iri: iriModules,
  lco: lcoModules,
  svm: svmModules,
};

/** All module outputs for one dimension (benchmark row first). */
export function precomputeModulesForDim(ctx: ReportContext, dim: DimKey): ModuleOutput[] {
  let extra: ModuleOutput[] = [];
  try {
    extra = BUILDERS[dim](ctx);
  } catch {
    extra = [];
  }
  return [benchmarkModule(ctx, dim), ...extra];
}

/** All module outputs for all eight dimensions (GATHER-time precompute). */
export function precomputeModules(ctx: ReportContext): ModuleOutputsByDim {
  const out: ModuleOutputsByDim = {};
  DIM_ORDER.forEach((dim) => {
    out[dim] = precomputeModulesForDim(ctx, dim);
  });
  return out;
}

/**
 * Module ids whose numbers describe the SECTOR / STAGE, not this startup
 * (static profile constants). W2 review (c): they never license a number in
 * an owner-proposed chart series.
 */
export const STATIC_MODULE_IDS: readonly string[] = ["agents/cfo-tam-sam-som.ts:auMarketProfile"];

/**
 * Output keys that carry weights, assumed norms, benchmark percentiles or
 * source counts rather than a measurement of this startup.
 */
export const NON_MEASURED_KEYS: ReadonlySet<string> = new Set([
  "weight",
  "p25",
  "p50",
  "p75",
  "benchmarkStage",
  "sourceCount",
  "poolPct",
  "vestingMonths",
  "cliffMonths",
  "esopPoolPct",
  "captureRatePct",
  "expansionMultiplier",
  "cagrPct",
  "reachableUnits",
  "durationMs",
]);

/**
 * Every finite number reachable in a set of module outputs (provenance
 * universe). `measuredOnly` (the charts-v2 default since W2 review (c))
 * drops static profile modules and the weight / norm / percentile keys so a
 * proposed series can only cite numbers measured for this startup.
 */
export function moduleNumbers(outputs: ModuleOutput[] | undefined, opts: { measuredOnly?: boolean } = {}): number[] {
  const nums: number[] = [];
  const walk = (v: unknown, key?: string): void => {
    if (opts.measuredOnly && key !== undefined && NON_MEASURED_KEYS.has(key)) return;
    if (typeof v === "number" && Number.isFinite(v)) nums.push(v);
    else if (Array.isArray(v)) v.forEach((item) => walk(item));
    else if (v && typeof v === "object") Object.entries(v as Record<string, unknown>).forEach(([k, item]) => walk(item, k));
  };
  (outputs ?? []).forEach((m) => {
    if (opts.measuredOnly && STATIC_MODULE_IDS.includes(m.id)) return;
    walk(m.output);
  });
  return nums;
}
