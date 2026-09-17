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
//   - valuation.methods.length === 6, scorecard present with weight 0
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

export interface EvidenceRow {
  evidence_id: string;
  source: EvidenceSource;
  label: string;
  status: EvidenceStatus;
  observedAt?: string;
  value?: string;
  dims: DimKey[];
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

export interface DimensionChapter {
  dim: DimKey;
  title: string;
  titleVi: string;
  weight: number;
  ownerAgent: AgentRole;
  supportingAgents: AgentRole[];
  score: number;
  band: Band;
  benchmark: { p25: number; p50: number; p75: number; percentile: number | null; stage: number };
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
}

export type ValuationMethodKey =
  | "revenue_multiple"
  | "berkus"
  | "dcf_proxy"
  | "comparables"
  | "risk_factor_summation"
  | "scorecard";

export const VALUATION_METHOD_KEYS: readonly ValuationMethodKey[] = [
  "revenue_multiple",
  "berkus",
  "dcf_proxy",
  "comparables",
  "risk_factor_summation",
  "scorecard",
];

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
  ask?: { preMoneyAud: number; raiseAud: number; verdict: "aligned" | "above_consensus" | "below_consensus"; gapPct: number };
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

export interface ReportV2 {
  schemaVersion: typeof REPORT_V2_SCHEMA_VERSION;
  reportId: string;
  snapshotId: string;
  projectId: string;
  accountId: string;
  tier: ReportTierV2;
  locale: "en" | "vi";
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
  actionPlan: { horizonDays: 90; steps: ActionStep[]; visuals: VisualSpecV2[] };
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
}

// ── Zod ─────────────────────────────────────────────────────────────────────

const dimKey = z.enum(["tre", "mpc", "ftv", "ptd", "cgh", "iri", "lco", "svm"]);
const agentRole = z.enum(AGENT_ROLES);
const criterionKey = z.enum(CRITERION_KEYS);
const qualityLevel = z.enum(QUALITY_LEVELS);
const growthPhaseId = z.enum(GROWTH_PHASE_IDS);
const band = z.enum(["strong", "developing", "early", "pending"]);
const dataState = z.enum(["real", "partial", "benchmark_only", "target"]);
const evidenceSource = z.enum(["stripe", "ga4", "github", "xero", "linkedin", "upload", "url", "self_declared", "connector_other"]);
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

const evidenceRow = z.object({
  evidence_id: z.string().min(1),
  source: evidenceSource,
  label: z.string(),
  status: evidenceStatus,
  observedAt: z.string().optional(),
  value: z.string().optional(),
  dims: z.array(dimKey),
});

/** G14-S36: cover badge — `label` is the exact badge text the TBR cover, dossier header and index card render. */
export const COVER_VERIFICATION_LABELS = ["Verified ABN", "ABN not verified"] as const;
const coverVerification = z.object({
  level: z.number().int().min(0).max(5),
  abnVerified: z.boolean(),
  label: z.enum(COVER_VERIFICATION_LABELS),
});
export type CoverVerification = z.infer<typeof coverVerification>;

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

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

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
    benchmark: z.object({ p25: z.number(), p50: z.number(), p75: z.number(), percentile: z.number().nullable(), stage: z.number() }),
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

const valuationChapter = z.object({
  currency: z.literal("AUD"),
  methods: z
    .array(valuationMethod)
    .length(6, { message: "valuation.methods must list exactly the 6 methods" })
    .refine((ms) => new Set(ms.map((m) => m.method)).size === 6, { message: "valuation.methods must be unique" })
    .refine((ms) => ms.some((m) => m.method === "scorecard" && m.weight === 0), { message: "scorecard must be present with weight 0" }),
  consensus: z.object({ lowAud: z.number(), midAud: z.number(), highAud: z.number(), confidence: z.number().min(0).max(1) }),
  ask: z
    .object({ preMoneyAud: z.number(), raiseAud: z.number(), verdict: z.enum(["aligned", "above_consensus", "below_consensus"]), gapPct: z.number() })
    .optional(),
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
  locale: z.enum(["en", "vi"]),
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
