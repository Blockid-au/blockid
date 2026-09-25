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
import type { ReportV2 } from "@/lib/report-v2/schema";
import type { ReportMeta } from "./meta";

export const FIRST_ANALYSIS_REPORT_VERSION = 1 as const;

/**
 * Job state. `done_partial` (migration 0391): at least
 * FULL_REPORT_PARTIAL_MIN_SECTIONS of the seven voices exist after the run's
 * retries; the founder sees and is emailed what exists ("part 1") while the
 * cron backfills the rest section by section, then the row becomes `done`
 * and the complete report is emailed once more.
 */
export type FullReportStatus = "queued" | "running" | "done" | "done_partial" | "failed";

export const FULL_REPORT_STATUSES: readonly FullReportStatus[] = [
  "queued",
  "running",
  "done",
  "done_partial",
  "failed",
];

/** Sections that must exist before a run is delivered as a partial report. */
export const FULL_REPORT_PARTIAL_MIN_SECTIONS = 4;
/** Attempts per section (each job run that tries it counts one) before it is `unavailable`. */
export const SECTION_MAX_ATTEMPTS = 3;
/** Whole-run attempt cap (store.ts re-exports it; kept here so pure modules can read it). */
export const FULL_REPORT_MAX_ATTEMPTS = 3;

/** A report the founder can read and download: complete or partial. */
export function isFullReportReadable(status: FullReportStatus | null | undefined): boolean {
  return status === "done" || status === "done_partial";
}

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

/** Inline marker appended to a market figure on its first occurrence in a section (agents.ts). */
export const BENCHMARK_TAG = "(benchmark — not from your data)";
/** Printed once under a section that carries any benchmark figure. */
export const BENCHMARK_FOOTER = "Figures marked as benchmarks are market references, not your data.";

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
  /**
   * Dollar figures in this section that are market references, not the
   * founder's data (agents.ts `checkGrounding`). Each is tagged inline on
   * first occurrence; when the list is non-empty the page and the PDF print
   * the one-line footer.
   */
  benchmarkFigures?: string[];
}

/** Per-section job state (S32-E partial delivery). */
export type SectionStatus = "pending" | "writing" | "done" | "failed" | "unavailable";

export interface SectionState {
  status: SectionStatus;
  /** Job runs that tried this section (the in-call correction retry is part of one attempt). */
  attempts: number;
  /** Last failure reason, for support and the honest PDF one-liner. */
  error?: string;
  /** Provider / model of the last attempt, successful or not. */
  provider?: string;
  model?: string;
  lastAttemptAt?: string;
}

/** The section as every consumer of the `/full-report` payload sees it — one shape, never a bare string. */
export interface AgentSectionView {
  role: FirstAnalysisAgent;
  title: string | null;
  body: string | null;
  nextSteps: string[];
  provider: string | null;
  model: string | null;
  status: SectionStatus;
  wordCount: number;
  generatedAt: string | null;
  benchmarkFigures: string[];
  attempts: number;
  error: string | null;
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
  /** The round the founder said they are raising, AUD, when stated. */
  askAud?: number;
  /** A founder-stated SAFE cap / pre-money, AUD, when stated. */
  statedCapAud?: number;
  /**
   * How the indicative range sits against the founder's own cap. Reported
   * alongside the range; never used to set it.
   */
  capCrossCheck?: {
    kind: "cap" | "pre_money" | "post_money" | "valuation";
    /** Indicative mid ÷ stated. */
    ratio: number;
    verdict: "consistent" | "indicative_above" | "indicative_below";
    /** e.g. "Your stated cap A$6.0M · indicative A$4.1M–A$8.7M → consistent". */
    note: string;
  };
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
  /** S32-C — which model wrote which section (./meta.ts); rebuilt after every section lands, so it is present on a failed or partial run too. */
  meta?: ReportMeta;
  /** Per-section attempts and status — the cron backfills only `pending` / `failed` sections with attempts left. */
  sections?: Partial<Record<FirstAnalysisAgent, SectionState>>;
  /** ISO — set once, the first time the run was delivered as a partial report. */
  partialAt?: string;
  /** Email stamps that the send-once column cannot carry on its own. */
  delivery?: {
    /** ISO — the "(part 1)" email went out at this time; the complete report is emailed once more when the row is done. */
    partialEmailedAt?: string;
  };
}

/** The report as the `/full-report` payload carries it: every voice present, as an object. */
export type FirstAnalysisReportView = Omit<FirstAnalysisReport, "agents"> & {
  agents: Record<FirstAnalysisAgent, AgentSectionView>;
};

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
/**
 * G28-C — the ReportV2 envelope. Since G28 every new intake row (a free
 * grant, an entitled member) runs the SAME pipeline the paid Trusted
 * Business Report runs (`orchestrateReport`, tier standard) and stores the
 * v3 document here — `analyses.full_report_json` now holds EITHER a
 * `FirstAnalysisReport` (version 1, the S32 seven-voice report — rows
 * written before G28 and their in-flight backfills) OR this envelope
 * (version "tbr-v2"). `version` is the discriminant; `isReportV2Envelope`
 * / `isFirstAnalysisReport` are the only readers allowed to tell them apart.
 *
 * The document is stored on the analyses row (not `svi_snapshots`) on
 * purpose: a snapshot needs an svi_accounts row and is UNIQUE per (account,
 * day), so a founder's second free run the same day would overwrite the
 * first. One row, one document, one PDF; no migration (jsonb already there).
 */
export const FULL_REPORT_V2_VERSION = "tbr-v2" as const;

/** What the page prints while the pipeline runs (the orchestrator's `pipeline_progress`). */
export interface ReportV2Progress {
  /** Orchestrator phase label ("gather", "analyze", "synthesis", …). */
  phase: string;
  /** 0–100. */
  pct: number;
  /** ISO — last update. */
  at: string;
  /** Chapters that have landed so far. */
  chaptersDone: number;
}

export interface FullReportV2Envelope {
  version: typeof FULL_REPORT_V2_VERSION;
  analysisId: string;
  /** Startup name as printed on the cover / subject line. */
  company: string;
  /** ISO — when the run started. */
  generatedAt: string;
  /** ISO — when the document landed. */
  completedAt?: string;
  /** The v3 document. Null while the pipeline is still running. */
  report: ReportV2 | null;
  /** assembled report id from the orchestrator (null until it lands). */
  reportId: string | null;
  progress: ReportV2Progress;
  /** Run telemetry (the tbr-quality row's numbers, kept with the document). */
  pipeline?: {
    calls: number;
    costUsd: number;
    durationMs: number;
    degradedSections: string[];
    deadlineHit: boolean;
    pipelineVersion: string;
  };
}

/** Whatever `analyses.full_report_json` holds. */
export type StoredFullReport = FirstAnalysisReport | FullReportV2Envelope;

export function isReportV2Envelope(v: unknown): v is FullReportV2Envelope {
  return Boolean(v) && typeof v === "object" && (v as { version?: unknown }).version === FULL_REPORT_V2_VERSION;
}

export function isFirstAnalysisReport(v: unknown): v is FirstAnalysisReport {
  return Boolean(v) && typeof v === "object" && (v as { version?: unknown }).version === FIRST_ANALYSIS_REPORT_VERSION;
}

/** Which job / renderer a row belongs to: the S32 seven-voice path only for a row that already holds a v1 report. */
export function reportPathFor(json: unknown): "v2" | "s32" {
  return isFirstAnalysisReport(json) ? "s32" : "v2";
}

export interface FullReportView {
  status: FullReportStatus | null;
  locked: boolean;
  /**
   * G28-C: which document this row carries — `"v2"` = the v3 Trusted
   * Business Report (`reportV2` / `progressV2`), `"s32"` = the seven-voice
   * first analysis (`report` / `preview`). A never-started row reads "v2".
   */
  kind: "v2" | "s32";
  /** The v3 document once the pipeline landed (kind "v2"). */
  reportV2: ReportV2 | null;
  /** Pipeline progress while running (kind "v2"). */
  progressV2: ReportV2Progress | null;
  report: FirstAnalysisReportView | null;
  preview: FirstAnalysisPreview | null;
  emailedAt: string | null;
  /** Masked destination (a***@example.com) when one is known. */
  emailTo: string | null;
  attempts: number;
  error: string | null;
  /** Seconds to wait before polling again — honest backoff under load. */
  pollAfterSec: number;
  /**
   * G25-C: the run is a never-started free report held for today's platform
   * cap (FREE_REPORTS_DAILY_CAP) — the cron starts it when the cap allows
   * and the PDF is e-mailed; the page says "queued, we e-mail you".
   */
  heldForCap?: boolean;
}

/**
 * Normalise `agents` to one object per voice. Tolerates the shapes a stored
 * row may carry — a full AgentSection, a bare string body (older writers),
 * or nothing — and derives `status` from the section, the per-section state
 * and the progress lists, in that order of trust.
 */
export function normaliseAgentSections(
  report: Pick<FirstAnalysisReport, "agents" | "progress" | "sections">,
): Record<FirstAnalysisAgent, AgentSectionView> {
  const out = {} as Record<FirstAnalysisAgent, AgentSectionView>;
  const agents = (report.agents ?? {}) as Partial<Record<FirstAnalysisAgent, AgentSection | string | null>>;
  for (const role of FIRST_ANALYSIS_AGENTS) {
    const raw = agents[role];
    const section: AgentSection | null =
      typeof raw === "string"
        ? { role, title: AGENT_META[role].label, body: raw, nextSteps: [], wordCount: countWords(raw), generatedAt: "" }
        : raw && typeof raw === "object" && typeof raw.body === "string"
          ? raw
          : null;
    const state = report.sections?.[role];
    const status: SectionStatus = section
      ? "done"
      : state?.status && state.status !== "done"
        ? state.status
        : report.progress?.failed?.includes(role)
          ? "failed"
          : report.progress?.current === role
            ? "writing"
            : "pending";
    out[role] = {
      role,
      title: section?.title ?? null,
      body: section?.body ?? null,
      nextSteps: section?.nextSteps ?? [],
      provider: section?.provider ?? state?.provider ?? null,
      model: section?.model ?? state?.model ?? null,
      status,
      wordCount: section?.wordCount ?? 0,
      generatedAt: section?.generatedAt || null,
      benchmarkFigures: section?.benchmarkFigures ?? [],
      attempts: state?.attempts ?? (section ? 1 : 0),
      error: state?.error ?? null,
    };
  }
  return out;
}

/** Voices the founder is still waiting on (not written, not given up on). */
export function pendingSections(report: Pick<FirstAnalysisReport, "agents" | "sections">): FirstAnalysisAgent[] {
  return FIRST_ANALYSIS_AGENTS.filter((role) => !report.agents?.[role] && report.sections?.[role]?.status !== "unavailable");
}

/** Voices given up on after SECTION_MAX_ATTEMPTS. */
export function unavailableSections(report: Pick<FirstAnalysisReport, "agents" | "sections">): FirstAnalysisAgent[] {
  return FIRST_ANALYSIS_AGENTS.filter((role) => !report.agents?.[role] && report.sections?.[role]?.status === "unavailable");
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
