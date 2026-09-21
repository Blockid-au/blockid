// IC memo / one-pager — the `ic_reports` object (G13-W5-D3, S-D3; BA spec
// §A.3 block 4 "IC memo export", §A.4 "IC memo", §A.5 S6 / F3, Appendix 1
// `POST /api/evaluations/[id]/ic-report`; goal doc §3 F3 + risk R5).
//
// One row per export. `sections` freezes the DECISION RECORD at export
// time — summary numbers, the weighted table, the valuation consensus, the
// thesis fit, the assessor's risks / questions / decision and (memo only)
// the seat views — so the memo the IC read is the memo that is stored,
// even after a re-score. private_notes are never in `sections`.
//
// Weights (F3 / R5): the memo prints the weighted score column always and
// the raw dimension WEIGHTS only when the exporter's plan is Program or
// above (`icMemoWeightsAllowed`); `weights_shown` records the choice.
//
// Kind: Scout exports the one-pager (S6); Firm / Program may export the
// memo with seat views (F3). `clampIcKind` enforces it server-side.
//
// The PDF is rendered by lib/pdf/ic-memo-pdf.tsx from the persisted
// snapshot (the dossier loader) + these sections; never stored as bytes.

import "server-only";
import type { AssessmentCardData } from "@/lib/svi/assessment-card";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import { appendAudit } from "@/lib/audit";
import { planIdToTier } from "@/lib/segments";
import type { DossierView } from "@/lib/evaluations/dossier";
import type { AssessmentDecision, EvaluationAssessment, RiskItem, FounderQuestion, DimensionRatings } from "@/lib/evaluations/assessments";
import type { DossierConsensus } from "@/lib/investor/organisations";

type Row = Record<string, unknown>;

export const IC_REPORT_KINDS = ["memo", "one_page"] as const;
export type IcReportKind = (typeof IC_REPORT_KINDS)[number];

export const icReportRequestSchema = z.object({ kind: z.enum(IC_REPORT_KINDS).optional() }).strict();

/** F3 / R5: raw weights only for Program and above. */
export function icMemoWeightsAllowed(planId: string | null | undefined): boolean {
  const t = planIdToTier(planId);
  return t === "vc_small" || t === "vc_ent" || t === "accel_starter" || t === "accel_growth" || t === "accel_ent" || t === "enterprise";
}

/** Scout → one_page only; Firm and above may export the memo. */
export function clampIcKind(planId: string | null | undefined, requested: IcReportKind | undefined): IcReportKind {
  const t = planIdToTier(planId);
  const memoAllowed = t !== "angel" && t !== "free" && t !== "starter" && t !== "growth";
  if (!requested) return memoAllowed ? "memo" : "one_page";
  return requested === "memo" && !memoAllowed ? "one_page" : requested;
}

// ─── Sections (persisted jsonb) ─────────────────────────────────────────────

export interface IcSections {
  /** G21-P1-B: the Assessment Card (SVI · Evidence Confidence · BlockID Verified · strength / gap · unverified claims); null without a report. */
  assessmentCard: AssessmentCardData | null;
  summary: {
    startupName: string;
    sector: string | null;
    stageLabel: string | null;
    website: string | null;
    state: string | null;
    svi: number | null;
    sviBand: string;
    delta30d: number | null;
    /** G21 P1 review: the published stage-cohort rank only; null below the floor. */
    percentile: number | null;
    /** The cohort size behind `percentile` — or the n the "No cohort benchmark yet (n = N)" tile reports. Null when nothing was scored. */
    percentileN: number | null;
    consentTier: string;
    evidenceItems: number;
    evidenceConnected: number;
    snapshotId: string | null;
    snapshotAt: string | null;
    badges: Array<{ axis: string; label: string }>;
  };
  svi_table: Array<{ dim: string; title: string; weight: number | null; score: number | null; weighted: number | null; p50: number; band: string; myRating: number | null; myStance: string | null }>;
  valuation: {
    consensus: { lowAud: number; midAud: number; highAud: number; confidence: number } | null;
    methods: Array<{ method: string; label: string; lowAud: number; midAud: number; highAud: number; weight: number }>;
    ask: unknown;
    myView: { lowAud: number | null; highAud: number | null; note: string | null } | null;
    comparablesN: number;
  };
  thesis_fit: { pct: number | null; mandateLabel: string | null; fitScore: number | null; reasons: string[]; gaps: string[] };
  risks: RiskItem[];
  questions: FounderQuestion[];
  decision: {
    value: AssessmentDecision | null;
    conviction: number | null;
    status: string | null;
    version: number | null;
    submittedAt: string | null;
    assessorUserId: string | null;
    sharedNotes: string | null;
  };
  /** memo only — each seat's decision, conviction and top risk (F3). private_notes never. */
  seats: Array<{ displayName: string; isMe: boolean; status: string | null; decision: AssessmentDecision | null; conviction: number | null; topRisk: string | null }>;
  consensus: { label: string; aggregate: string | null; tally: Record<AssessmentDecision, number>; disagreement: string[]; meanConviction: number | null } | null;
}

const topRiskOf = (risks: RiskItem[]): string | null => {
  const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  const sorted = [...risks].sort((a, b) => order[a.severity] - order[b.severity]);
  return sorted[0]?.title ?? null;
};

/** Pure: the persisted decision record from what the dossier already holds. */
export function buildIcSections(view: DossierView, kind: IcReportKind, opts: { weightsShown: boolean }): IcSections {
  const h = view.header;
  const mine: EvaluationAssessment | null = view.assessment.mine;
  const ratings: DimensionRatings = mine?.dimensionRatings ?? {};
  const svi_table = view.report.dims.map((d) => {
    const r = ratings[d.code as keyof DimensionRatings];
    return {
      dim: d.code,
      title: d.title,
      weight: opts.weightsShown ? d.weight : null,
      score: d.score,
      weighted: d.score != null ? Math.round((d.score * d.weight) / 100 * 10) / 10 : null,
      p50: d.p50,
      band: d.band,
      myRating: r?.rating ?? null,
      myStance: r?.stance ?? null,
    };
  });
  const v = view.valuation;
  const c: DossierConsensus | null = view.consensus;
  return {
    assessmentCard: view.assessmentCard ?? null,
    summary: {
      startupName: h.name,
      sector: h.badges.find((b) => b.axis === "industry")?.label ?? null,
      stageLabel: h.badges.find((b) => b.axis === "stage")?.label ?? null,
      website: h.website,
      state: h.state,
      svi: h.svi,
      sviBand: h.sviBand,
      delta30d: h.delta30d,
      percentile: h.percentile?.value ?? null,
      percentileN: h.percentile?.cohortSize ?? null,
      consentTier: h.consentTier,
      evidenceItems: h.evidence.items,
      evidenceConnected: h.evidence.connected,
      snapshotId: h.snapshotId,
      snapshotAt: h.lastSnapshotAt,
      badges: h.badges.map((b) => ({ axis: b.axis, label: b.label })),
    },
    svi_table,
    valuation: {
      consensus: v.consensus,
      methods: v.methods.filter((m) => m.applicable).map((m) => ({ method: m.method, label: m.label, lowAud: m.lowAud, midAud: m.midAud, highAud: m.highAud, weight: m.weight })),
      ask: v.ask,
      myView: v.myView,
      comparablesN: v.comparables.n,
    },
    thesis_fit: {
      pct: mine?.thesisFitPct ?? null,
      mandateLabel: h.mandateFit?.mandateLabel ?? null,
      fitScore: h.mandateFit?.score ?? null,
      reasons: h.mandateFit?.reasons.slice(0, 4) ?? [],
      gaps: h.mandateFit?.gaps.slice(0, 4) ?? [],
    },
    risks: mine?.risks ?? [],
    questions: mine?.questionsForFounder ?? [],
    decision: {
      value: mine?.decision ?? null,
      conviction: mine?.conviction ?? null,
      status: mine?.status ?? null,
      version: mine?.version ?? null,
      submittedAt: mine?.submittedAt ?? null,
      assessorUserId: mine?.assessorUserId ?? null,
      sharedNotes: mine?.sharedNotes ?? null,
    },
    seats:
      kind === "memo" && c?.available
        ? c.seats.map((s) => ({
            displayName: s.displayName,
            isMe: s.isMe,
            status: s.assessment?.status ?? null,
            decision: s.assessment?.decision ?? null,
            conviction: s.assessment?.conviction ?? null,
            topRisk: s.assessment ? topRiskOf(s.assessment.risks) : null,
          }))
        : [],
    consensus:
      kind === "memo" && c?.available && c.seatCount > 1
        ? { label: c.label, aggregate: c.aggregate, tally: c.tally, disagreement: c.disagreement, meanConviction: c.meanConviction }
        : null,
  };
}

// ─── Persistence ─────────────────────────────────────────────────────────────

export interface IcReportRow {
  id: string;
  evaluationId: string;
  projectId: string;
  userId: string;
  assessmentId: string | null;
  snapshotId: string | null;
  kind: IcReportKind;
  sections: IcSections;
  weightsShown: boolean;
  generatedBy: string;
  pages: number | null;
  createdAt: string;
}

const IC_COLUMNS = "id, evaluation_id, project_id, user_id, assessment_id, snapshot_id, kind, sections, weights_shown, generated_by, pages, created_at";

function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const m = (error.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("could not find the table");
}

export function mapIcReportRow(r: Row): IcReportRow {
  const kind = String(r.kind ?? "memo");
  return {
    id: String(r.id),
    evaluationId: String(r.evaluation_id),
    projectId: String(r.project_id),
    userId: String(r.user_id),
    assessmentId: r.assessment_id == null ? null : String(r.assessment_id),
    snapshotId: r.snapshot_id == null ? null : String(r.snapshot_id),
    kind: (IC_REPORT_KINDS as readonly string[]).includes(kind) ? (kind as IcReportKind) : "memo",
    sections: (r.sections && typeof r.sections === "object" ? r.sections : {}) as IcSections,
    weightsShown: r.weights_shown === true,
    generatedBy: String(r.generated_by ?? r.user_id ?? ""),
    pages: typeof r.pages === "number" ? r.pages : null,
    createdAt: String(r.created_at ?? ""),
  };
}

export type CreateIcReportResult = { ok: true; report: IcReportRow } | { ok: false; error: "unavailable" | "db_error"; message: string };

export async function createIcReport(input: { view: DossierView; userId: string; kind: IcReportKind; weightsShown: boolean; pages?: number | null }): Promise<CreateIcReportResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "unavailable", message: "Service unavailable" };
  const sections = buildIcSections(input.view, input.kind, { weightsShown: input.weightsShown });
  const { data, error } = await supabase
    .from("ic_reports")
    .insert({
      evaluation_id: input.view.header.evaluationId,
      project_id: input.view.header.projectId,
      user_id: input.userId,
      assessment_id: input.view.assessment.mine?.id ?? null,
      snapshot_id: input.view.header.snapshotId,
      kind: input.kind,
      sections,
      weights_shown: input.weightsShown,
      generated_by: input.userId,
      pages: input.pages ?? null,
    })
    .select(IC_COLUMNS)
    .maybeSingle();
  if (error || !data) {
    if (isMissingTable(error)) return { ok: false, error: "unavailable", message: "IC memo export is not available on this environment yet (migration 0403 pending)" };
    console.error("[blockid:ic-reports] insert failed", error);
    return { ok: false, error: "db_error", message: error?.message ?? "Export failed" };
  }
  const report = mapIcReportRow(data as Row);
  void appendAudit({
    user_id: input.userId,
    actor: "user",
    action: "ic_report.exported",
    resource_type: "ic_report",
    resource_id: report.id,
    detail: {
      evaluation_id: report.evaluationId,
      project_id: report.projectId,
      kind: report.kind,
      weights_shown: report.weightsShown,
      pages: report.pages,
      decision: sections.decision.value,
      seats: sections.seats.length,
      // G22-A: a cohort seat's export names the batch it came through.
      ...(input.view.viewer.viaBatchId ? { via_batch_id: input.view.viewer.viaBatchId } : {}),
    },
  }).catch(() => {});
  return { ok: true, report };
}

/** Record the rendered page count on the row (fire-and-forget by callers). */
export async function setIcReportPages(id: string, pages: number): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase.from("ic_reports").update({ pages }).eq("id", id);
}

/** Exports on one evaluation visible to the caller (own rows + same-org seats' rows). */
export async function listIcReports(evaluationId: string, userIds: string[]): Promise<{ available: boolean; reports: IcReportRow[] }> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userIds.length) return { available: false, reports: [] };
  const { data, error } = await supabase.from("ic_reports").select(IC_COLUMNS).eq("evaluation_id", evaluationId).in("user_id", userIds).order("created_at", { ascending: false }).limit(50);
  if (error) {
    if (!isMissingTable(error)) console.error("[blockid:ic-reports] list failed", error);
    return { available: false, reports: [] };
  }
  return { available: true, reports: ((data ?? []) as Row[]).map(mapIcReportRow) };
}

export async function getIcReport(id: string, evaluationId: string, userIds: string[]): Promise<IcReportRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userIds.length) return null;
  const { data, error } = await supabase.from("ic_reports").select(IC_COLUMNS).eq("id", id).eq("evaluation_id", evaluationId).in("user_id", userIds).maybeSingle();
  if (error || !data) return null;
  return mapIcReportRow(data as Row);
}
