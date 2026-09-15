// S32-B "the first analysis" — the shape of the full first report.
//
// Pure types and constants. No `server-only`, no I/O: the result page, the
// saved view, the PDF renderer, the job runner and the API route all read
// this one definition, so none of them can disagree about what a section is.
//
// A FirstAnalysisReport is written INCREMENTALLY by the job runner (see
// ./job.ts): the deterministic parts (input echo, SVI, valuation, action
// plan) land first, then one agent section at a time. `progress` says what
// is being written right now so the page can be honest about it.

import type { InputEcho } from "@/lib/analyses/input-echo";
import type { ReportMeta } from "./meta";

export const FIRST_ANALYSIS_REPORT_VERSION = 1 as const;

export type FullReportStatus = "queued" | "running" | "done" | "failed";

export const FULL_REPORT_STATUSES: readonly FullReportStatus[] = [
  "queued",
  "running",
  "done",
  "failed",
];

export function isFullReportStatus(v: unknown): v is FullReportStatus {
  return typeof v === "string" && (FULL_REPORT_STATUSES as readonly string[]).includes(v);
}

/** The seven C-level voices in the first analysis, in writing order. */
export const FIRST_ANALYSIS_AGENTS = [
  "ceo",
  "cfo",
  "cmo",
  "cto",
  "cpo",
  "clo",
  "chro",
] as const;

export type FirstAnalysisAgent = (typeof FIRST_ANALYSIS_AGENTS)[number];

export function isFirstAnalysisAgent(v: unknown): v is FirstAnalysisAgent {
  return typeof v === "string" && (FIRST_ANALYSIS_AGENTS as readonly string[]).includes(v);
}

/**
 * How each voice is named to the founder. The internal role stays in the
 * data (it keys the section); the label is the lens the founder can act on.
 */
export const AGENT_META: Record<
  FirstAnalysisAgent,
  { role: string; label: string; lens: string; writing: string }
> = {
  ceo: {
    role: "CEO",
    label: "Strategy",
    lens: "Where you are, what the score means, and the one thing to fix first",
    writing: "The CEO is writing the strategy summary…",
  },
  cfo: {
    role: "CFO",
    label: "Finances & valuation",
    lens: "What the valuation rests on, what would move it, and the money plan",
    writing: "The CFO is checking the valuation…",
  },
  cmo: {
    role: "CMO",
    label: "Market & customers",
    lens: "Who buys, why now, and how the first customers are found",
    writing: "The CMO is sizing the market…",
  },
  cto: {
    role: "CTO",
    label: "Product & technology",
    lens: "What to build first, what to buy, and the technical risks",
    writing: "The CTO is reviewing the product…",
  },
  cpo: {
    role: "CPO",
    label: "Product & validation",
    lens: "The customer problem, the proof you have, and the proof you need",
    writing: "The CPO is mapping the validation gaps…",
  },
  clo: {
    role: "CLO",
    label: "Legal & compliance",
    lens: "Structure, IP, ESIC and the Australian obligations that bite early",
    writing: "The CLO is checking structure and compliance…",
  },
  chro: {
    role: "CHRO",
    label: "Team & people",
    lens: "Who is missing, how to bring them in, and how to keep them",
    writing: "The CHRO is looking at the team…",
  },
};

/** Minimum words a section must carry to be accepted from the model. */
export const AGENT_SECTION_MIN_WORDS = 150;
/** Every section ends with exactly this many next steps. */
export const AGENT_NEXT_STEPS = 3;

export interface AgentSection {
  role: FirstAnalysisAgent;
  /** The section's own title, as written by the agent. */
  title: string;
  /** Plain paragraphs separated by blank lines. No markdown headings. */
  body: string;
  nextSteps: string[];
  wordCount: number;
  /** Which provider / model served it — surfaced for observability only.
   *  `provider` is the dispatcher id (`deepinfra`, `gemini`, `claude-oauth`,
   *  …) when the platform caller served it (S32-C `via`). */
  provider?: string;
  model?: string;
  /** How the call was routed: CEO = `synthesis`, the other voices = `report`. */
  taskClass?: "classify" | "report" | "synthesis";
  generatedAt: string;
}

export interface DimensionReasoning {
  key: string;
  label: string;
  /** 0–100 */
  score: number;
  /** e.g. "20%" — the dimension's weight in the index. */
  weight: string;
  rationale: string;
  evidence: string[];
  gaps: string[];
}

export interface SviSection {
  total: number;
  baseline: number;
  netAdjustment: number;
  stage: number;
  stageLabel: string;
  confidence: number;
  sector?: string;
  sectorLabel?: string;
  summary: string;
  dimensions: DimensionReasoning[];
  riskPenalties: { label: string; points: number; reason: string }[];
  evidenceGaps: {
    priority: "P0" | "P1" | "P2";
    label: string;
    action: string;
    impact: number;
  }[];
}

export interface ValuationMethodRow {
  name: string;
  lowAud: number;
  midAud: number;
  highAud: number;
  /** 0–1 */
  weight: number;
  rationale: string;
  assumptions: string[];
}

export interface ValuationSection {
  lowAud: number;
  midAud: number;
  highAud: number;
  /** The blend label, e.g. "Berkus (50%) + Scorecard (50%)". */
  method: string;
  /** 0–100 */
  confidence: number;
  /**
   * `revenue` when a real revenue figure from the input drove a multiple;
   * `svi_based` when no revenue was provided and the range rests on the
   * SVI-mapped methods with stated assumptions. Never a fabricated number.
   */
  basis: "revenue" | "svi_based";
  /** Every assumption behind the number, in plain words. */
  assumptions: string[];
  methods: ValuationMethodRow[];
  /** The one-line honesty note printed under the range. */
  note: string;
}

export interface ActionPlanItem {
  title: string;
  detail: string;
  priority: "P0" | "P1" | "P2";
  timeline: "this_week" | "30_day" | "60_day" | "90_day";
  impact: string;
}

export interface ActionPlanSection {
  thisWeek: ActionPlanItem | null;
  /** Day-0 → day-30 sequence, in order. */
  steps: { day: number; title: string; detail: string }[];
  milestones: { day: 30 | 60 | 90; title: string; goal: string; evidence: string[] }[];
  actions: ActionPlanItem[];
}

export interface ReportProgress {
  /** What is being written right now, or null when idle / finished. */
  current: FirstAnalysisAgent | null;
  completed: FirstAnalysisAgent[];
  failed: FirstAnalysisAgent[];
  /** Set while the AI queue is saturated: seconds until the next attempt. */
  queuedForSec?: number;
}

export interface FirstAnalysisReport {
  version: typeof FIRST_ANALYSIS_REPORT_VERSION;
  analysisId: string;
  company: string;
  /** ISO — when the deterministic sections were built. */
  generatedAt: string;
  /** ISO — set when the last agent section landed. */
  completedAt?: string;
  echo: InputEcho;
  svi: SviSection;
  valuation: ValuationSection;
  actionPlan: ActionPlanSection;
  agents: Partial<Record<FirstAnalysisAgent, AgentSection>>;
  progress: ReportProgress;
  /** S32-C — which model wrote which section (./meta.ts); set when the report finishes. */
  meta?: ReportMeta;
}

/** What the page sees pre-gate for a guest: echo + SVI + one CEO paragraph. */
export interface FirstAnalysisPreview {
  company: string;
  echo: InputEcho;
  svi: SviSection;
  valuation: ValuationSection;
  /** First paragraph of the CEO section, once it exists. */
  ceoParagraph: string | null;
}

/**
 * The gated view the poll endpoint returns. `locked` means the caller is a
 * guest who has not yet given an email at the free-summary card; the
 * preview is theirs, the rest waits.
 */
export interface FullReportView {
  status: FullReportStatus | null;
  locked: boolean;
  report: FirstAnalysisReport | null;
  preview: FirstAnalysisPreview | null;
  emailedAt: string | null;
  /** Masked destination (a***@example.com) when one is known. */
  emailTo: string | null;
  attempts: number;
  error: string | null;
  /** Seconds to wait before polling again — honest backoff under load. */
  pollAfterSec: number;
}

/** First paragraph of an agent body, for the pre-gate CEO preview. */
export function firstParagraph(body: string | null | undefined): string | null {
  if (!body) return null;
  const para = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p.length > 0);
  return para ?? null;
}

/** Founder-facing names of the eight dimensions. */
export const DIMENSION_LABELS: Record<string, string> = {
  ftv: "Founder & Team",
  mpc: "Market & Problem",
  ptd: "Product & Tech",
  tre: "Traction & Revenue",
  cgh: "Cap Table & Governance",
  iri: "Investor Readiness",
  lco: "Legal & Compliance",
  svm: "Strategic Vision & Moat",
};

/** Word count the way the acceptance rule counts it. */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
