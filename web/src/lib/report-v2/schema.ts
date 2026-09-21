// ReportV2 — the one JSON contract every Trusted Business Report surface
// renders from (web, PDF, DOCX, Investor Dossier, email).
//
// G13-W1-R1 / spec docs/plans/investor-clarity-2026-09-15/12-product-ai-tbr-v2.md
// §A.2 (types) + the Zod rules baked in at the end of §A.2:
//   - dimensions.length === 8, in DIM_ORDER
//   - every chapter has a primaryVisual with a renderable svg (role="img")
//   - criteria.length >= 1 per chapter
//   - evidence may be empty, but then primaryVisual.dataState is never "real"
//     (§A.3 fallback rows use benchmark_only / target / partial)
//   - valuation.methods: the 7 method keys (6 on pre-S42 stored rows), unique;
//     applicable weights sum to 1 (or every row is non-applicable) and a
//     non-applicable row weighs 0 (G19-S42)
//   - appendix.dataPrinciple equals the approved sentence
//
// Persisted in `svi_snapshots.report_v2` + `assembled_reports.report_json`
// (migration 0395). Readers must tolerate null and fall back to
// `adapter.ts` (v1 snapshot → v2 on read).
//
// Client-safe: no I/O, no server-only imports.

import { z } from "zod";
import type { CriterionKey, QualityLevel } from "@/lib/evaluation-criteria";
import { CRITERION_KEYS, QUALITY_LEVELS } from "@/lib/evaluation-criteria";
import type { PhaseBlocker, PhaseGateResult } from "@/lib/growth/phase-gate";
import { GROWTH_PHASE_IDS, type GrowthPhaseId } from "@/lib/growth/phase-taxonomy";
import {
  DIM_ORDER,
  type DimKey,
  type EvidenceSource,
} from "@/lib/report-pipeline/dimension-owners";
import { AGENT_ROLES, type AgentRole, type ConsistencyIssue, type SectionAuditRecord } from "@/lib/report-pipeline/types";
import { ALL_VISUAL_KINDS, type Band, type DataState, type VisualSpecV2 } from "@/lib/report-visuals/types";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/valuation-certificate/types";

export { DIM_ORDER, DATA_PRINCIPLE_SENTENCE };
export type { DimKey, EvidenceSource, Band, DataState, VisualSpecV2 };

export const REPORT_V2_SCHEMA_VERSION = "2.0" as const;
export const FREE_PAGE_BUDGET = 10 as const;

export type ReportTierV2 = "free" | "standard" | "premium" | "investor_memo";
export type EvidenceStatus = "evidenced" | "partial" | "missing" | "stale";

/** G19-S43: the six evidence-ladder rungs an Evidence Hub row carries (lib/evidence/confidence-cap.ts). */
export const EVIDENCE_CONFIDENCE_LEVELS = ["self_declared", "public_url", "document_uploaded", "connected_source", "transaction_data", "third_party_verified"] as const;
export type EvidenceConfidence = (typeof EVIDENCE_CONFIDENCE_LEVELS)[number];

/**
 * G19-S43: a `missing` row's call to action — where the founder adds the
 * input (an internal href) and what it is worth (`lift`, from the one lift
 * model `lib/svi-lift.ts`). Rendered as a CTA row on web / PDF / DOCX.
 */
export interface EvidenceCta {
  label: string;
  href: string;
  lift?: number;
}

export interface EvidenceRow {
  evidence_id: string;
  source: EvidenceSource;
  label: string;
  status: EvidenceStatus;
  observedAt?: string;
  value?: string;
  dims: DimKey[];
  /** G19-S43: the origin-capped confidence rung (Evidence Hub / svi_evidence rows). */
  confidence?: EvidenceConfidence;
  /** G19-S43: present on `missing` rows only. */
  cta?: EvidenceCta;
}

export interface AuditStamp {
  grounded: boolean;
  uncited: number;
  revised: boolean;
  auditor: "llm-auditor";
  at: string;
}

export interface CriterionCard {
  key: CriterionKey;
  title: string;
  score: number;
  quality: QualityLevel;
  verdict: string;
  strengths: string[];
  gaps: string[];
  nextAction: string;
  citations: Array<{ evidence_id: string; quote: string }>;
  grounded: boolean;
  agent: AgentRole;
}

// ── G19-S41: score ledger ("how this score was built") ──────────────────────

/** Where a ledger signal came from (the six evidence-ladder rungs + audit / penalty / stage). */
export const SCORE_SIGNAL_SOURCES = [
  "self_declared",
  "public_url",
  "document_uploaded",
  "connected_source",
  "transaction_data",
  "third_party_verified",
  "audit",
  "penalty",
  "stage",
] as const;
export type ScoreSignalSource = (typeof SCORE_SIGNAL_SOURCES)[number];

export interface ScoreBreakdownSignal {
  signal: string;
  points: number;
  source: ScoreSignalSource;
  /** Omitted = moves the 0–100 score; "adjustment" = applied to the SVI adjustment after the confidence step. */
  scale?: "adjustment";
}

/**
 * Per-chapter ledger, copied from `SVISubScore.breakdown` (svi-analysis.ts):
 * `clamp(base + Σ score-scale points) === score` and
 * `round((score − 50) × weight/100 × confidenceMultiplier) + Σ adjustment-scale points === adjustment`.
 * `assessed:false` = no real input moved the dimension (pure baseline) — the
 * chapter renders as pending, never as a confident number.
 */
export interface ScoreBreakdown {
  base: number;
  signals: ScoreBreakdownSignal[];
  /** The effective evidence confidence the formula used (0.2–1.0). */
  confidenceMultiplier: number;
  /** Business-verification factor already inside `confidenceMultiplier` (L0 0.85 … L5 1.10, bounded); informational. */
  verificationMultiplier?: number;
  /** The dimension's signed contribution to the SVI total. */
  adjustment: number;
  assessed: boolean;
}

/** Report-level ledger: every field signed so that base + Σ dims + stage + penalties + sector + metrics + ci + floorClamp === total. */
export interface SviLedger {
  base: 100;
  dimAdjustments: Record<DimKey, number>;
  stageBonus: number;
  riskPenalties: number;
  sectorAdj: number;
  metricsBonus: number;
  ciBoost: number;
  floorClamp: number;
  total: number;
}

export interface DimensionChapter {
  dim: DimKey;
  title: string;
  titleVi: string;
  weight: number;
  ownerAgent: AgentRole;
  supportingAgents: AgentRole[];
  score: number;
  band: Band;
  /**
   * Stage anchors (p25 / p50 / p75) plus the founder's rank. G21 P1 review:
   * `percentile` is set only when a cohort of `n` companies published it
   * (lib/benchmarks/publication-rules.ts) — below the floor it is null and
   * `n` says how many were available (absent on rows stored before P1).
   */
  benchmark: { p25: number; p50: number; p75: number; percentile: number | null; n?: number | null; stage: number };
  /** ≤ 80 words, cites evidence ids. */
  verdict: string;
  primaryVisual: VisualSpecV2;
  secondaryVisuals: VisualSpecV2[];
  evidence: EvidenceRow[];
  /** The mapped subset of the 13 criteria. */
  criteria: CriterionCard[];
  strengths: string[];
  gaps: string[];
  nextAction: { title: string; window: "this_week" | "30d" | "90d"; expectedLift: number; evidenceToAdd?: EvidenceSource };
  phaseLens: { phaseId: GrowthPhaseId; whatMattersNow: string; floor?: number; floorMet?: boolean };
  /** Framework names injected into the prompt, shown in the appendix. */
  frameworks: string[];
  /** Deterministic module outputs used. */
  modules: Array<{ id: string; output: Record<string, unknown> }>;
  audit: AuditStamp;
  runIds: string[];
  /** Free tier: chapters 6–9 render as one-card summaries. */
  renderAs: "full" | "card";
  /** G13-W2-R2: true when the owner call failed twice / was budget-stopped and this is a deterministic card. */
  degraded?: boolean;
  degradeReason?: string;
  /** Owner-proposed score before the ±10 clamp (§C.11); `scoreNote` explains a reconciliation. */
  proposedScore?: number;
  scoreNote?: string;
  /** G19-S41: "How this score was built" — absent on documents stored before S41. */
  scoreBreakdown?: ScoreBreakdown;
  /**
   * G27: one line (≤ 25 words) the owner agent may write for the investor
   * takeaway callout; the renderer falls back to the deterministic template
   * (`report-v2/investment-view.ts`) and an LLM line wins only when it
   * passes the claim gate. Optional — never a migration.
   */
  investorTakeaway?: string;
}

// ── G27: investment view (spec docs/design/tbr-v3-investor-report-spec.md § 4) ──

export const INVESTMENT_BANDS = ["A", "B", "C", "D"] as const;
export type InvestmentBand = (typeof INVESTMENT_BANDS)[number];
export type InvestmentConviction = "low" | "medium" | "high";
export type RiskLevel = "low" | "medium" | "high";

export interface InvestmentCondition {
  kind: "floor" | "unverified" | "ask" | "blocker";
  text: string;
  dim?: DimKey;
}
export interface InvestmentPoint {
  text: string;
  dim?: DimKey;
  score?: number;
  lift?: number;
}
export interface RiskMatrixRow {
  id: string;
  kind: "gap" | "blocker" | "unverified" | "ask";
  text: string;
  dim?: DimKey;
  likelihood: RiskLevel;
  impact: RiskLevel;
  mitigation: string;
}
export interface ImprovementStep {
  rank: number;
  title: string;
  dim: DimKey;
  window: "this_week" | "30d" | "90d";
  /** The catalogue / owner lift, printed as-is (never cumulative). */
  expectedLift: number;
  /** this_week 1 · 30d 2 · 90d 3 */
  effort: 1 | 2 | 3;
  /** expectedLift ÷ effort (2 dp). */
  priority: number;
  /** Localised "evidence to add" label, when the step adds an input. */
  evidenceToAdd?: string;
  href?: string;
  source: "chapter" | "plan" | "criterion" | "evidence";
}

/**
 * G27 — the deterministic investment view every v3 surface renders (web,
 * PDF, DOCX, e-mail). Pure derivation from the stored document + the
 * Assessment Card (`investment-view.ts`); optional on stored rows and
 * rebuilt at read (`ensureInvestmentView`) so no migration is needed.
 */
export interface InvestmentView {
  version: 1;
  locale: "en" | "vi";
  band: InvestmentBand;
  /** Short label ("With conditions") and the rubric wording ("Investable with conditions"). */
  bandLabel: string;
  bandWording: string;
  /** Which rubric row fired (tests / audit): "D:pending", "D:ec", "C:band", … */
  rule: string;
  conviction: InvestmentConviction;
  convictionLine: string;
  /** Evidence confidence 0–100 — the Assessment Card's one number. */
  evidenceConfidence: number;
  /** Σ weight × score over assessed dims, renormalised 0–100; null when nothing is assessed. */
  compositeScore: number | null;
  compositeBand: Band;
  pendingDims: number;
  floorMisses: DimKey[];
  blockers: number;
  unverifiedClaims: number;
  askVerdict: "aligned" | "above_consensus" | "below_consensus" | null;
  /** The mandatory sub-line (verbatim, spec § 4). */
  subline: string;
  conditions: InvestmentCondition[];
  /** Band D: the evidence CTAs printed instead of conditions. */
  evidenceCtas: EvidenceCta[];
  reasons: InvestmentPoint[];
  risks: InvestmentPoint[];
  keyPoints: string[];
  riskMatrix: RiskMatrixRow[];
  improvementPlan: ImprovementStep[];
  whatMovesIt: string[];
  takeaways: Record<DimKey, string>;
  /** The CEO agent's own label + sentence when it disagrees with the rubric band (never a silent overwrite). */
  analystSynthesis: { label: ExecutiveVerdictLabel; text: string } | null;
}

export type ValuationMethodKey =
  | "revenue_multiple"
  | "berkus"
  | "dcf_proxy"
  | "comparables"
  | "risk_factor_summation"
  | "scorecard"
  | "stage_baseline";

export const VALUATION_METHOD_KEYS: readonly ValuationMethodKey[] = [
  "revenue_multiple",
  "berkus",
  "dcf_proxy",
  "comparables",
  "risk_factor_summation",
  "scorecard",
  "stage_baseline",
];

/** G19-S42: provenance of the revenue figure the valuation ran on. */
export type ValuationRevenueSourceV2 = "connector" | "document" | "founder_stated" | "none";

/** G19-S42: the "Inputs & assumptions" table — what the CFO model actually ran on. */
export interface ValuationInputsV2 {
  mrrAud: number;
  arrAud: number;
  revenueSource: ValuationRevenueSourceV2;
  /** Observed monthly growth; absent when nothing observed it. */
  monthlyGrowthRatePct?: number;
  /** true when growth-dependent methods used the sector median instead of an observed rate. */
  growthAssumed: boolean;
  assumedGrowthRatePct?: number;
  esicQualifies: boolean;
  rdtiRefundAud: number;
  berkusPillars: { soundIdea: boolean; prototype: boolean; qualityTeam: boolean; strategicRelationships: boolean; productRollout: boolean };
  stage: string;
  sviStage?: number;
  sector: string;
  sectorMultipleLow: number;
  sectorMultipleHigh: number;
  sectorMultipleMedian?: number;
  raiseStated: boolean;
  raiseAud?: number;
}

/** G19-S42: an external reference the consensus is checked against (backtest quartile, stage baseline). */
export interface ValuationCrossCheck {
  label: string;
  lowAud?: number;
  midAud?: number;
  highAud?: number;
  source: string;
  asOf: string;
  /** Sample size behind the row when it is an empirical bucket. */
  n?: number;
}

export interface ValuationChapter {
  currency: "AUD";
  methods: Array<{
    method: ValuationMethodKey;
    lowAud: number;
    midAud: number;
    highAud: number;
    weight: number;
    rationale: string;
    applicable: boolean;
  }>;
  consensus: { lowAud: number; midAud: number; highAud: number; confidence: number };
  /** Only when the founder stated a cap / raise — never invented (G19-S42). */
  ask?: { preMoneyAud: number; raiseAud: number; verdict: "aligned" | "above_consensus" | "below_consensus"; gapPct: number };
  /** G19-S42 — absent on pre-S42 stored rows and on the read-time adapter fallback. */
  inputs?: ValuationInputsV2;
  /** G19-S42 — one line per method: how its mid was derived. */
  derivation?: Partial<Record<ValuationMethodKey, string>>;
  /** G19-S42 — backtest quartile + stage baseline rows. */
  crossChecks?: ValuationCrossCheck[];
  /** G19-S42 — consistency-gate notes (e.g. consensus outside the stage band), rendered on every surface. */
  consistencyNotes?: string[];
  sectorMultiples: { sector: string; low: number; median: number; high: number; sourceLabel: string; sourceDate: string };
  comparables: {
    n: number;
    withMultiplesN: number;
    rows: Array<{ name: string; stage: string; industry: string; year: number; arrMultiple?: number; source: string }>;
  };
  unitEconomics?: Record<string, unknown>;
  scenarios: { bear: number; base: number; bull: number };
  visuals: VisualSpecV2[];
  narrative: string;
  audit: AuditStamp;
}

export interface MatchedGrant {
  id: string;
  name: string;
  amountAud: number | null;
  deadline?: string;
  fit: number;
  url?: string;
}
export interface MatchedProgram {
  id: string;
  name: string;
  amountAud: number | null;
  deadline?: string;
  fit: number;
  url?: string;
}

export interface ActionStep {
  day: 30 | 60 | 90;
  title: string;
  ownerAgent: AgentRole;
  dimension: DimKey;
  criterion?: CriterionKey;
  expectedLift: number;
  evidenceToAdd?: EvidenceSource;
}

// ── G19-S47: structured executive summary ────────────────────────────────────

export const EXECUTIVE_VERDICT_LABELS = ["back", "back_with_conditions", "watch", "not_yet"] as const;
export type ExecutiveVerdictLabel = (typeof EXECUTIVE_VERDICT_LABELS)[number];
export type ActionWindow = "this_week" | "30d" | "90d";

/** Word caps the S47 contract enforces (CEO output + the markdown → structured fallback). */
export const EXECUTIVE_CAPS = { headlineWords: 14, summaryParagraphs: 3, paragraphWords: 60, reasons: 3, gaps: 3, actions: 5, benchmarks: 8 } as const;

export interface ExecutiveReason {
  title: string;
  body: string;
  dim?: DimKey;
}
export interface ExecutiveGap {
  title: string;
  body: string;
  dim?: DimKey;
  /** SVI points the fix is worth, when the lift model knows. */
  lift?: number;
}
export interface ExecutiveBenchmark {
  dim: DimKey;
  score: number;
  band: Band;
  note?: string;
}
export interface ExecutiveAction {
  title: string;
  detail: string;
  window: ActionWindow;
  dim?: DimKey;
}

/**
 * G19-S47 — the executive summary as sections, not one run-on paragraph:
 * headline → 2–3 summary paragraphs → key insight → 3 reasons to back →
 * 3 critical gaps → benchmark chips → phase now → verdict → ≤ 5 actions.
 * Written by the CEO call (JSON contract) or derived from the stored
 * markdown / the chapters by `report-v2/executive-structure.ts`; never
 * carries markdown syntax or HTML comments. `thesis` stays for back-compat.
 */
export interface ExecutiveStructured {
  headline: string;
  summary: string[];
  keyInsight?: string;
  reasonsToBack: ExecutiveReason[];
  criticalGaps: ExecutiveGap[];
  benchmarks: ExecutiveBenchmark[];
  phaseNow: { phaseId: GrowthPhaseId; label: string; blocker: string; whatItTakes: string };
  verdict: { label: ExecutiveVerdictLabel; condition?: string; confidence: number };
  actions: ExecutiveAction[];
}

export interface ReportV2 {
  schemaVersion: typeof REPORT_V2_SCHEMA_VERSION;
  reportId: string;
  snapshotId: string;
  projectId: string;
  accountId: string;
  tier: ReportTierV2;
  /** G19-S45: widened to every locale the UI offers (a stored document keeps its generation locale). */
  locale: "en" | "vi" | "es" | "ja";
  generatedAt: string;
  promptVersionIds: Partial<Record<AgentRole, string>>;
  pipelineVersion: string;
  /** How this document was produced — "adapter" = built on read from a v1 snapshot. */
  source: "pipeline" | "adapter" | "fixture";
  cover: {
    startupName: string;
    sector: string;
    stage: number;
    stageLabel: string;
    phaseId: GrowthPhaseId;
    svi: { total: number; band: Band; cohortPercentile: number | null; cohortN: number | null; deltaVsLast: number | null };
    dims: Record<DimKey, { score: number; weight: number; band: Band; p25: number; p50: number; p75: number; percentile: number | null }>;
    /** ≤ 30 words each, CEO. */
    threeQuestions: { where: string; worth: string; next: string };
    visuals: VisualSpecV2[];
    /**
     * G14-S36: business verification at generation time —
     * `projects.verification_level` (0–5, level-engine.ts), `abnVerified`
     * = L2+ (ABR Active), `label` = the badge text ("Verified ABN" /
     * "ABN not verified"). Optional so documents stored before S36 stay
     * valid; the adapter always fills it (level 0 when unknown).
     */
    verification?: CoverVerification;
    /** G19-S41: base 100 → dims → stage → penalties → total; absent on pre-S41 documents. */
    sviLedger?: SviLedger;
    /**
     * G19-S43 cover honesty: the evidence confidence the SVI formula ran at
     * (`SVIAnalysis.confidenceMultiplier`, 0.2–1.0) and the ladder rung it
     * corresponds to ("Evidence: mostly self-declared (×0.50)"). Absent on
     * pre-S43 documents.
     */
    evidenceLevel?: CoverEvidenceLevel;
  };
  executive: {
    thesis: string;
    strengths: string[];
    gaps: string[];
    verdict: string;
    confidence: number;
    phaseNow: PhaseGateResult;
    visuals: VisualSpecV2[];
    audit: AuditStamp;
    /** G19-S47 — always present at render (`ensureExecutiveStructured`); optional on stored rows. */
    structured?: ExecutiveStructured;
  };
  /** Exactly 8, in DIM_ORDER. */
  dimensions: DimensionChapter[];
  valuation: ValuationChapter;
  phaseGates: {
    current: GrowthPhaseId;
    matrix: Array<{ criterion: CriterionKey; phase: GrowthPhaseId; required: boolean; quality: QualityLevel; met: boolean }>;
    blockers: PhaseBlocker[];
    visuals: VisualSpecV2[];
  };
  moneyOnTable: { grants: MatchedGrant[]; programs: MatchedProgram[]; totalAud: number; visuals: VisualSpecV2[] };
  actionPlan: {
    horizonDays: 90;
    steps: ActionStep[];
    visuals: VisualSpecV2[];
    /** G19-S43: the engine's P0 / P1 evidence gaps as CTA rows (linked, with the catalogue lift). */
    evidenceToAdd?: EvidenceRow[];
  };
  appendix: {
    method: string;
    dataPrinciple: string;
    disclaimer: string;
    evidenceRegister: EvidenceRow[];
    auditLog: SectionAuditRecord[];
    comparablesN: number;
    comparablesWithMultiplesN: number;
    sourcesDated: Array<{ label: string; date: string }>;
  };
  quality: { score: number; groundedShare: number; consistencyIssues: ConsistencyIssue[]; degradedSections: string[] };
  pageBudget: { free: typeof FREE_PAGE_BUDGET; renderedPages?: number };
  /** G27 — always present at render (`ensureInvestmentView`); optional on stored rows. */
  investmentView?: InvestmentView;
}

// ── Zod ─────────────────────────────────────────────────────────────────────

const dimKey = z.enum(["tre", "mpc", "ftv", "ptd", "cgh", "iri", "lco", "svm"]);
const agentRole = z.enum(AGENT_ROLES);
const criterionKey = z.enum(CRITERION_KEYS);
const qualityLevel = z.enum(QUALITY_LEVELS);
const growthPhaseId = z.enum(GROWTH_PHASE_IDS);
const band = z.enum(["strong", "developing", "early", "pending"]);
const dataState = z.enum(["real", "partial", "benchmark_only", "target"]);
const evidenceSource = z.enum(["stripe", "ga4", "github", "xero", "linkedin", "upload", "url", "self_declared", "founder_profile", "connector_other", "external"]);
const evidenceStatus = z.enum(["evidenced", "partial", "missing", "stale"]);
const visualKind = z.enum(ALL_VISUAL_KINDS as [string, ...string[]]);

const visualSpec = z.object({
  id: z.string().min(1),
  kind: visualKind,
  type: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  data: z.record(z.string(), z.unknown()),
  placement: z.enum(["inline", "full_page", "sidebar"]),
  agentId: agentRole,
  dim: dimKey.optional(),
  dataState,
  a11y: z.object({
    title: z.string().min(1),
    description: z.string(),
    tableFallback: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
  }),
  svg: z.string().optional(),
});

/** A chapter's primary visual must carry a renderable svg (visual gate C.9-4). */
const renderableVisual = visualSpec.refine(
  (v) => typeof v.svg === "string" && v.svg.includes('role="img"') && v.svg.includes("<title"),
  { message: "primaryVisual.svg must be a rendered, accessible SVG (role=\"img\" + <title>)" },
);

const evidenceConfidence = z.enum(EVIDENCE_CONFIDENCE_LEVELS);
const evidenceCta = z.object({ label: z.string().min(1), href: z.string().min(1), lift: z.number().optional() });
const evidenceRow = z.object({
  evidence_id: z.string().min(1),
  source: evidenceSource,
  label: z.string(),
  status: evidenceStatus,
  observedAt: z.string().optional(),
  value: z.string().optional(),
  dims: z.array(dimKey),
  confidence: evidenceConfidence.optional(),
  cta: evidenceCta.optional(),
});

/** G19-S43: cover "Evidence: mostly self-declared (×0.50)". */
const coverEvidenceLevel = z.object({ level: evidenceConfidence, confidenceMultiplier: z.number().min(0).max(1) });
export type CoverEvidenceLevel = z.infer<typeof coverEvidenceLevel>;

/** G14-S36: cover badge — `label` is the exact badge text the TBR cover, dossier header and index card render. */
export const COVER_VERIFICATION_LABELS = ["Verified ABN", "ABN not verified"] as const;
const coverVerification = z.object({
  level: z.number().int().min(0).max(5),
  abnVerified: z.boolean(),
  label: z.enum(COVER_VERIFICATION_LABELS),
});
export type CoverVerification = z.infer<typeof coverVerification>;

// G19-S41
const scoreSignalSource = z.enum(SCORE_SIGNAL_SOURCES);
const scoreBreakdownSignal = z.object({
  signal: z.string().min(1),
  points: z.number(),
  source: scoreSignalSource,
  scale: z.literal("adjustment").optional(),
});
export const scoreBreakdownSchema = z.object({
  base: z.number().min(0).max(100),
  signals: z.array(scoreBreakdownSignal),
  confidenceMultiplier: z.number().min(0).max(1),
  verificationMultiplier: z.number().positive().optional(),
  adjustment: z.number(),
  assessed: z.boolean(),
});
const dimAdjustments = z.object({ tre: z.number(), mpc: z.number(), ftv: z.number(), ptd: z.number(), cgh: z.number(), iri: z.number(), lco: z.number(), svm: z.number() });
export const sviLedgerSchema = z
  .object({
    base: z.literal(100),
    dimAdjustments,
    stageBonus: z.number(),
    riskPenalties: z.number().max(0),
    sectorAdj: z.number(),
    metricsBonus: z.number(),
    ciBoost: z.number(),
    floorClamp: z.number(),
    total: z.number(),
  })
  .refine(
    (l) => Object.values(l.dimAdjustments).reduce((a, b) => a + b, 0) + l.base + l.stageBonus + l.riskPenalties + l.sectorAdj + l.metricsBonus + l.ciBoost + l.floorClamp === l.total,
    { message: "sviLedger fields must sum exactly to total" },
  );

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

// G19-S47 — structured executive: no markdown syntax / HTML comment survives into the document.
/** True when a string still carries markdown or comment syntax (`**`, a leading `#`, `<!--`, a `> ` blockquote, fences). */
export function hasMarkdownSyntax(s: string): boolean {
  return /\*\*|<!--|```|(^|\n)\s*#{1,6}\s|(^|\n)\s*>\s/.test(s);
}
const plain = (max: number, min = 0) =>
  z
    .string()
    .min(min)
    .refine((s) => !hasMarkdownSyntax(s), { message: "no markdown syntax or HTML comments" })
    .refine((s) => wordCount(s) <= max, { message: `≤ ${max} words` });
const executiveReason = z.object({ title: plain(24, 1), body: plain(90), dim: dimKey.optional() });
const executiveGap = z.object({ title: plain(24, 1), body: plain(90), dim: dimKey.optional(), lift: z.number().optional() });
const executiveBenchmark = z.object({ dim: dimKey, score: z.number().min(0).max(100), band, note: plain(40).optional() });
const executiveAction = z.object({ title: plain(30, 1), detail: plain(90), window: z.enum(["this_week", "30d", "90d"]), dim: dimKey.optional() });
export const executiveStructuredSchema = z.object({
  headline: plain(EXECUTIVE_CAPS.headlineWords, 1),
  summary: z.array(plain(EXECUTIVE_CAPS.paragraphWords, 1)).min(1).max(EXECUTIVE_CAPS.summaryParagraphs),
  keyInsight: plain(90).optional(),
  reasonsToBack: z.array(executiveReason).max(EXECUTIVE_CAPS.reasons),
  criticalGaps: z.array(executiveGap).max(EXECUTIVE_CAPS.gaps),
  benchmarks: z.array(executiveBenchmark).max(EXECUTIVE_CAPS.benchmarks),
  phaseNow: z.object({ phaseId: growthPhaseId, label: plain(12), blocker: plain(60), whatItTakes: plain(60) }),
  verdict: z.object({ label: z.enum(EXECUTIVE_VERDICT_LABELS), condition: plain(60).optional(), confidence: z.number().min(0).max(1) }),
  actions: z.array(executiveAction).max(EXECUTIVE_CAPS.actions),
});

const auditStamp = z.object({
  grounded: z.boolean(),
  uncited: z.number().int().nonnegative(),
  revised: z.boolean(),
  auditor: z.literal("llm-auditor"),
  at: z.string(),
});

const criterionCard = z.object({
  key: criterionKey,
  title: z.string(),
  score: z.number(),
  quality: qualityLevel,
  verdict: z.string(),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  nextAction: z.string(),
  citations: z.array(z.object({ evidence_id: z.string(), quote: z.string() })),
  grounded: z.boolean(),
  agent: agentRole,
});

const dimensionChapter = z
  .object({
    dim: dimKey,
    title: z.string().min(1),
    titleVi: z.string(),
    weight: z.number().positive(),
    ownerAgent: agentRole,
    supportingAgents: z.array(agentRole),
    score: z.number().min(0).max(100),
    band,
    benchmark: z.object({ p25: z.number(), p50: z.number(), p75: z.number(), percentile: z.number().nullable(), n: z.number().nullable().optional(), stage: z.number() }),
    verdict: z.string().refine((s) => wordCount(s) <= 80, { message: "verdict must be ≤ 80 words" }),
    primaryVisual: renderableVisual,
    secondaryVisuals: z.array(visualSpec),
    evidence: z.array(evidenceRow),
    criteria: z.array(criterionCard).min(1, { message: "criteria.length must be ≥ 1" }),
    strengths: z.array(z.string()),
    gaps: z.array(z.string()),
    nextAction: z.object({
      title: z.string(),
      window: z.enum(["this_week", "30d", "90d"]),
      expectedLift: z.number(),
      evidenceToAdd: evidenceSource.optional(),
    }),
    phaseLens: z.object({ phaseId: growthPhaseId, whatMattersNow: z.string(), floor: z.number().optional(), floorMet: z.boolean().optional() }),
    frameworks: z.array(z.string()),
    modules: z.array(z.object({ id: z.string(), output: z.record(z.string(), z.unknown()) })),
    audit: auditStamp,
    runIds: z.array(z.string()),
    renderAs: z.enum(["full", "card"]),
    degraded: z.boolean().optional(),
    degradeReason: z.string().optional(),
    proposedScore: z.number().optional(),
    scoreNote: z.string().optional(),
    scoreBreakdown: scoreBreakdownSchema.optional(),
    investorTakeaway: z.string().optional(),
  })
  .refine((c) => c.evidence.length > 0 || c.primaryVisual.dataState !== "real", {
    message: "a chapter with no evidence rows cannot claim a `real` primary visual",
    path: ["primaryVisual", "dataState"],
  });

const valuationMethod = z.object({
  method: z.enum(VALUATION_METHOD_KEYS as [ValuationMethodKey, ...ValuationMethodKey[]]),
  lowAud: z.number(),
  midAud: z.number(),
  highAud: z.number(),
  weight: z.number().min(0).max(1),
  rationale: z.string(),
  applicable: z.boolean(),
});

const valuationInputs = z.object({
  mrrAud: z.number(),
  arrAud: z.number(),
  revenueSource: z.enum(["connector", "document", "founder_stated", "none"]),
  monthlyGrowthRatePct: z.number().optional(),
  growthAssumed: z.boolean(),
  assumedGrowthRatePct: z.number().optional(),
  esicQualifies: z.boolean(),
  rdtiRefundAud: z.number(),
  berkusPillars: z.object({ soundIdea: z.boolean(), prototype: z.boolean(), qualityTeam: z.boolean(), strategicRelationships: z.boolean(), productRollout: z.boolean() }),
  stage: z.string(),
  sviStage: z.number().optional(),
  sector: z.string(),
  sectorMultipleLow: z.number(),
  sectorMultipleHigh: z.number(),
  sectorMultipleMedian: z.number().optional(),
  raiseStated: z.boolean(),
  raiseAud: z.number().optional(),
});

const valuationCrossCheck = z.object({
  label: z.string(),
  lowAud: z.number().optional(),
  midAud: z.number().optional(),
  highAud: z.number().optional(),
  source: z.string(),
  asOf: z.string(),
  n: z.number().optional(),
});

const valuationChapter = z.object({
  currency: z.literal("AUD"),
  methods: z
    .array(valuationMethod)
    // 6 = pre-S42 stored rows (no stage_baseline); 7 = G19-S42 onwards.
    .min(6, { message: "valuation.methods must list the 6 (pre-S42) or 7 methods" })
    .max(7, { message: "valuation.methods must list the 6 (pre-S42) or 7 methods" })
    .refine((ms) => new Set(ms.map((m) => m.method)).size === ms.length, { message: "valuation.methods must be unique" })
    .refine((ms) => ms.every((m) => m.applicable || m.weight === 0), { message: "a non-applicable method must weigh 0" })
    .refine(
      (ms) => {
        const sum = ms.filter((m) => m.applicable).reduce((a, m) => a + m.weight, 0);
        return sum === 0 || Math.abs(sum - 1) < 0.01;
      },
      { message: "applicable method weights must sum to 1 (or every method is non-applicable)" },
    ),
  consensus: z.object({ lowAud: z.number(), midAud: z.number(), highAud: z.number(), confidence: z.number().min(0).max(1) }),
  ask: z
    .object({ preMoneyAud: z.number(), raiseAud: z.number(), verdict: z.enum(["aligned", "above_consensus", "below_consensus"]), gapPct: z.number() })
    .optional(),
  inputs: valuationInputs.optional(),
  derivation: z.partialRecord(z.enum(VALUATION_METHOD_KEYS as [ValuationMethodKey, ...ValuationMethodKey[]]), z.string()).optional(),
  crossChecks: z.array(valuationCrossCheck).optional(),
  consistencyNotes: z.array(z.string()).optional(),
  sectorMultiples: z.object({ sector: z.string(), low: z.number(), median: z.number(), high: z.number(), sourceLabel: z.string(), sourceDate: z.string() }),
  comparables: z.object({
    n: z.number().int().nonnegative(),
    withMultiplesN: z.number().int().nonnegative(),
    rows: z.array(z.object({ name: z.string(), stage: z.string(), industry: z.string(), year: z.number(), arrMultiple: z.number().optional(), source: z.string() })),
  }),
  unitEconomics: z.record(z.string(), z.unknown()).optional(),
  scenarios: z.object({ bear: z.number(), base: z.number(), bull: z.number() }),
  visuals: z.array(visualSpec),
  narrative: z.string(),
  audit: auditStamp,
});

// G27 — investment view (optional, rebuilt at read by `ensureInvestmentView`).
const investmentBand = z.enum(INVESTMENT_BANDS);
const riskLevel = z.enum(["low", "medium", "high"]);
const actionWindow = z.enum(["this_week", "30d", "90d"]);
const investmentPoint = z.object({ text: z.string(), dim: dimKey.optional(), score: z.number().optional(), lift: z.number().optional() });
export const investmentViewSchema = z.object({
  version: z.literal(1),
  locale: z.enum(["en", "vi"]),
  band: investmentBand,
  bandLabel: z.string().min(1),
  bandWording: z.string().min(1),
  rule: z.string().min(1),
  conviction: z.enum(["low", "medium", "high"]),
  convictionLine: z.string().min(1),
  evidenceConfidence: z.number().min(0).max(100),
  compositeScore: z.number().min(0).max(100).nullable(),
  compositeBand: band,
  pendingDims: z.number().int().min(0).max(8),
  floorMisses: z.array(dimKey),
  blockers: z.number().int().nonnegative(),
  unverifiedClaims: z.number().int().nonnegative(),
  askVerdict: z.enum(["aligned", "above_consensus", "below_consensus"]).nullable(),
  subline: z.string().min(1),
  conditions: z.array(z.object({ kind: z.enum(["floor", "unverified", "ask", "blocker"]), text: z.string().min(1), dim: dimKey.optional() })).max(3),
  evidenceCtas: z.array(evidenceCta),
  reasons: z.array(investmentPoint).max(3),
  risks: z.array(investmentPoint).max(3),
  keyPoints: z.array(z.string().min(1)).max(5),
  riskMatrix: z.array(
    z.object({ id: z.string().min(1), kind: z.enum(["gap", "blocker", "unverified", "ask"]), text: z.string().min(1), dim: dimKey.optional(), likelihood: riskLevel, impact: riskLevel, mitigation: z.string() }),
  ),
  improvementPlan: z.array(
    z.object({
      rank: z.number().int().positive(),
      title: z.string().min(1),
      dim: dimKey,
      window: actionWindow,
      expectedLift: z.number(),
      effort: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      priority: z.number(),
      evidenceToAdd: z.string().optional(),
      href: z.string().optional(),
      source: z.enum(["chapter", "plan", "criterion", "evidence"]),
    }),
  ),
  whatMovesIt: z.array(z.string()),
  takeaways: z.object({ tre: z.string(), mpc: z.string(), ftv: z.string(), ptd: z.string(), cgh: z.string(), iri: z.string(), lco: z.string(), svm: z.string() }),
  analystSynthesis: z.object({ label: z.enum(EXECUTIVE_VERDICT_LABELS), text: z.string() }).nullable(),
});

const phaseBlocker = z.object({
  code: z.enum(["missing_required_criteria", "criteria_below_threshold", "dimension_below_floor", "deliverables_incomplete"]),
  subject: z.string(),
  detail: z.string(),
});

const phaseGateResult = z.object({
  currentPhase: growthPhaseId,
  currentPhaseLabel: z.string(),
  nextPhase: growthPhaseId.nullable(),
  phaseOrder: z.number(),
  completionPct: z.number(),
  canAdvance: z.boolean(),
  blockers: z.array(phaseBlocker),
});

const matched = z.object({
  id: z.string(),
  name: z.string(),
  amountAud: z.number().nullable(),
  deadline: z.string().optional(),
  fit: z.number(),
  url: z.string().optional(),
});

export const reportV2Schema = z.object({
  schemaVersion: z.literal(REPORT_V2_SCHEMA_VERSION),
  reportId: z.string().min(1),
  snapshotId: z.string(),
  projectId: z.string(),
  accountId: z.string(),
  tier: z.enum(["free", "standard", "premium", "investor_memo"]),
  locale: z.enum(["en", "vi", "es", "ja"]),
  generatedAt: z.string(),
  promptVersionIds: z.record(z.string(), z.string()),
  pipelineVersion: z.string(),
  source: z.enum(["pipeline", "adapter", "fixture"]),
  cover: z.object({
    startupName: z.string(),
    sector: z.string(),
    stage: z.number(),
    stageLabel: z.string(),
    phaseId: growthPhaseId,
    svi: z.object({ total: z.number(), band, cohortPercentile: z.number().nullable(), cohortN: z.number().nullable(), deltaVsLast: z.number().nullable() }),
    dims: z.record(
      dimKey,
      z.object({ score: z.number(), weight: z.number(), band, p25: z.number(), p50: z.number(), p75: z.number(), percentile: z.number().nullable() }),
    ),
    threeQuestions: z.object({
      where: z.string().refine((s) => wordCount(s) <= 30, "≤ 30 words"),
      worth: z.string().refine((s) => wordCount(s) <= 30, "≤ 30 words"),
      next: z.string().refine((s) => wordCount(s) <= 30, "≤ 30 words"),
    }),
    visuals: z.array(visualSpec),
    verification: coverVerification.optional(),
    sviLedger: sviLedgerSchema.optional(),
    evidenceLevel: coverEvidenceLevel.optional(),
  }),
  executive: z.object({
    thesis: z.string(),
    strengths: z.array(z.string()),
    gaps: z.array(z.string()),
    verdict: z.string(),
    confidence: z.number().min(0).max(1),
    phaseNow: phaseGateResult,
    visuals: z.array(visualSpec),
    audit: auditStamp,
    structured: executiveStructuredSchema.optional(),
  }),
  dimensions: z
    .array(dimensionChapter)
    .length(8, { message: "dimensions must have exactly 8 chapters" })
    .refine((ds) => ds.every((d, i) => d.dim === DIM_ORDER[i]), { message: "dimensions must follow DIM_ORDER (tre, mpc, ftv, ptd, cgh, iri, lco, svm)" }),
  valuation: valuationChapter,
  phaseGates: z.object({
    current: growthPhaseId,
    matrix: z.array(z.object({ criterion: criterionKey, phase: growthPhaseId, required: z.boolean(), quality: qualityLevel, met: z.boolean() })),
    blockers: z.array(phaseBlocker),
    visuals: z.array(visualSpec),
  }),
  moneyOnTable: z.object({ grants: z.array(matched), programs: z.array(matched), totalAud: z.number(), visuals: z.array(visualSpec) }),
  actionPlan: z.object({
    horizonDays: z.literal(90),
    steps: z.array(
      z.object({
        day: z.union([z.literal(30), z.literal(60), z.literal(90)]),
        title: z.string(),
        ownerAgent: agentRole,
        dimension: dimKey,
        criterion: criterionKey.optional(),
        expectedLift: z.number(),
        evidenceToAdd: evidenceSource.optional(),
      }),
    ),
    visuals: z.array(visualSpec),
    evidenceToAdd: z.array(evidenceRow).optional(),
  }),
  appendix: z.object({
    method: z.string(),
    dataPrinciple: z.literal(DATA_PRINCIPLE_SENTENCE),
    disclaimer: z.string(),
    evidenceRegister: z.array(evidenceRow),
    auditLog: z.array(
      z.object({
        sectionId: z.string(),
        uncitedClaims: z.array(z.string()),
        findings: z.array(z.string()),
        revised: z.boolean(),
        grounded: z.boolean(),
        skipped: z.enum(["budget", "tier", "clean", "cap"]).optional(),
        // G24-D: compact per-section audit summary (why a zero-uncited section is still ungrounded).
        llmAudited: z.boolean().optional(),
        hadIssues: z.boolean().optional(),
      }),
    ),
    comparablesN: z.number().int().nonnegative(),
    comparablesWithMultiplesN: z.number().int().nonnegative(),
    sourcesDated: z.array(z.object({ label: z.string(), date: z.string() })),
  }),
  quality: z.object({
    score: z.number(),
    groundedShare: z.number().min(0).max(1),
    consistencyIssues: z.array(
      z.object({
        type: z.enum(["score_mismatch", "narrative_conflict", "evidence_gap", "data_misalignment"]),
        severity: z.enum(["low", "medium", "high"]),
        description: z.string(),
        criteria: z.array(criterionKey),
        suggestedFix: z.string().optional(),
      }),
    ),
    degradedSections: z.array(z.string()),
  }),
  pageBudget: z.object({ free: z.literal(FREE_PAGE_BUDGET), renderedPages: z.number().optional() }),
  investmentView: investmentViewSchema.optional(),
});

export class ReportV2ValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`ReportV2 invalid: ${issues.slice(0, 5).join("; ")}${issues.length > 5 ? ` (+${issues.length - 5} more)` : ""}`);
    this.name = "ReportV2ValidationError";
    this.issues = issues;
  }
}

/** Validate and narrow; throws `ReportV2ValidationError` listing every issue. */
export function assertReportV2(value: unknown): ReportV2 {
  const parsed = reportV2Schema.safeParse(value);
  if (!parsed.success) {
    throw new ReportV2ValidationError(parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`));
  }
  return parsed.data as unknown as ReportV2;
}

/** Non-throwing guard for readers that must tolerate old / null rows. */
export function isReportV2(value: unknown): value is ReportV2 {
  return reportV2Schema.safeParse(value).success;
}

/** Cheap structural sniff (no full validation) for hot read paths. */
export function looksLikeReportV2(value: unknown): value is ReportV2 {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { schemaVersion?: unknown }).schemaVersion === REPORT_V2_SCHEMA_VERSION &&
    Array.isArray((value as { dimensions?: unknown }).dimensions) &&
    (value as { dimensions: unknown[] }).dimensions.length === 8
  );
}
