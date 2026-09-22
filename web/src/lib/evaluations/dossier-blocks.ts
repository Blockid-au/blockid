// Investor Dossier — blocks 2 (Valuation) + 5 (Progress radar) and the
// header's "mandate fit" + "Δ since last view" (G13-W4-R4, BA spec §A.2,
// §A.3 blocks 2/5, header "Decision chip" row; TBR spec §F S-R4 "dossier
// consumes ReportV2 (mandate fit, decision record, Δ since last view)").
//
// Everything reads persisted rows / the ReportV2 the loader already holds;
// nothing here calls a model or computes a score, except `scoreFit`, which
// is the deterministic S-T2 formula and only runs when the nightly
// `mandate_fit_scores` row is missing for (primary mandate, project).
//
//   valuation   ReportV2.valuation → consensus band, 6 methods, ask, sector
//               multiples, AU comparables N, the range_bars spec (rendered
//               inline by the page) and the assessor's own "my valuation
//               view" (block 4, read-only here — the form is S-D2).
//   progress    lib/evaluations/progress-radar.ts scoped to ONE evaluation
//               (store wrapper filters listEvaluations), the last progress
//               email (`evaluator_progress_sends`), and "since my last
//               assessment" = latest snapshot SVI − the SVI on
//               `assessment.snapshot_id`.
//   fit         listMandates(viewer).primary → mandate_fit_scores row, else
//               scoreFit(primary, startup from taxonomy + snapshot).
//   last view   newest `dossier.viewed` audit row for (viewer, evaluation);
//               Δ = SVI now − the `svi_total` the audit detail carried.
//
// Every reader swallows its own failure (missing table / column → the
// block renders its honest empty state).

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { EvaluationAssessment } from "@/lib/evaluations/assessments";
import { buildEvaluatorProgress, createSupabaseProgressStore, type EvaluatorProgressItem, type ProgressDeadline } from "@/lib/evaluations/progress-radar";
import { listMandates } from "@/lib/investors/mandates";
import { scoreFit, type FitMandate, type FitResult, type FitStartup } from "@/lib/investors/fit-v2";
import { stageKeyFromNumber } from "@/lib/investors/fit-refresh";
import type { StartupTaxonomyRow } from "@/lib/taxonomy/startup-taxonomy";
import { makeVisual } from "@/lib/report-visuals";
import type { VisualSpecV2 } from "@/lib/report-visuals/types";
import type { ReportV2, AvailableValuationChapter as ValuationChapter } from "@/lib/report-v2/schema";
import { readLastDossierView } from "./dossier-audit";

type Row = Record<string, unknown>;
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

// ─── Block 2 — Valuation ─────────────────────────────────────────────────────

export const VALUATION_METHOD_LABEL: Record<ValuationChapter["methods"][number]["method"], string> = {
  revenue_multiple: "Revenue multiple",
  berkus: "Berkus",
  dcf_proxy: "DCF proxy",
  comparables: "AU comparables",
  risk_factor_summation: "Risk-factor summation",
  scorecard: "Scorecard (reference)",
  stage_baseline: "AU stage baseline",
};

export interface DossierValuationMethod {
  method: ValuationChapter["methods"][number]["method"];
  label: string;
  lowAud: number;
  midAud: number;
  highAud: number;
  weight: number;
  applicable: boolean;
  rationale: string;
}

export interface DossierValuationBlock {
  available: boolean;
  /** "pipeline" = the CFO 5-method run persisted at snapshot time; "adapter" = three-case model lifted on read. */
  source: ReportV2["source"] | null;
  /** True when no dimension is scored — the range would be the SVI-0 model, so it is withheld. */
  pending: boolean;
  consensus: ValuationChapter["consensus"] | null;
  methods: DossierValuationMethod[];
  ask: ValuationChapter["ask"] | null;
  sectorMultiples: ValuationChapter["sectorMultiples"] | null;
  comparables: { n: number; withMultiplesN: number };
  scenarios: ValuationChapter["scenarios"] | null;
  /** The range_bars spec (rendered inline as SVG by the page); the ask marker is inside `data`. */
  rangeBars: VisualSpecV2 | null;
  /** Assessor's own view from block 4 (evaluation_assessments.valuation_view) — never shown to the founder. */
  myView: { lowAud: number | null; highAud: number | null; note: string | null } | null;
  audit: ValuationChapter["audit"] | null;
}

export function emptyValuationBlock(): DossierValuationBlock {
  return { available: false, source: null, pending: true, consensus: null, methods: [], ask: null, sectorMultiples: null, comparables: { n: 0, withMultiplesN: 0 }, scenarios: null, rangeBars: null, myView: null, audit: null };
}

/** Pure: block 2 from the report the loader resolved (+ the assessor's own view). */
export function buildValuationBlock(report: ReportV2 | null, mine: Pick<EvaluationAssessment, "valuationView"> | null): DossierValuationBlock {
  if (!report) return emptyValuationBlock();
  const v = report.valuation;
  if (v.status === "unavailable") return { ...emptyValuationBlock(), source: report.source, audit: v.audit };
  const pending = report.cover.svi.band === "pending";
  const base = v.visuals.find((x) => x.kind === "range_bars") ?? null;
  // Overlay the assessor's view as a second marker on the same chart (§A.3 block 2).
  let rangeBars = base;
  if (base && mine?.valuationView && (mine.valuationView.low_aud || mine.valuationView.high_aud)) {
    const low = mine.valuationView.low_aud ?? mine.valuationView.high_aud ?? 0;
    const high = mine.valuationView.high_aud ?? mine.valuationView.low_aud ?? low;
    const data = base.data as { rows?: Array<Record<string, unknown>> };
    rangeBars = makeVisual({
      id: `${base.id}-mine`,
      kind: "range_bars",
      title: base.title,
      subtitle: `${base.subtitle ?? ""} · with my view`.replace(/^ · /, ""),
      agentId: base.agentId,
      dataState: base.dataState,
      data: { ...(base.data as Record<string, unknown>), rows: [...(data.rows ?? []), { label: "My view", low, mid: (low + high) / 2, high }] } as never,
      a11y: { ...base.a11y, tableFallback: [...base.a11y.tableFallback, { method: "My view", low, mid: Math.round((low + high) / 2), high }] },
    });
  }
  return {
    available: true,
    source: report.source,
    pending,
    consensus: pending ? null : v.consensus,
    methods: pending ? [] : v.methods.map((m) => ({ method: m.method, label: VALUATION_METHOD_LABEL[m.method] ?? m.method, lowAud: m.lowAud, midAud: m.midAud, highAud: m.highAud, weight: m.weight, applicable: m.applicable, rationale: m.rationale })),
    ask: v.ask ?? null,
    sectorMultiples: pending ? null : v.sectorMultiples,
    comparables: { n: v.comparables.n, withMultiplesN: v.comparables.withMultiplesN },
    scenarios: pending ? null : v.scenarios,
    rangeBars: pending ? null : rangeBars,
    myView: mine?.valuationView ? { lowAud: mine.valuationView.low_aud ?? null, highAud: mine.valuationView.high_aud ?? null, note: mine.valuationView.method_note ?? null } : null,
    audit: v.audit,
  };
}

// ─── Block 5 — Progress radar ────────────────────────────────────────────────

export interface DossierProgressBlock {
  available: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  /** This evaluation's row from the evaluator progress radar (null when the store has nothing). */
  item: EvaluatorProgressItem | null;
  /** Dated deadlines for THIS startup only. */
  deadlines: ProgressDeadline[];
  /** Last weekly progress email the evaluator received (evaluator_progress_sends). */
  lastSendAt: string | null;
  /** "Since my last assessment": latest snapshot SVI vs the SVI on assessment.snapshot_id (assessor only). */
  sinceAssessment: { version: number; snapshotId: string; assessedAt: string; sviThen: number | null; sviNow: number | null; delta: number | null } | null;
  /** Score-history sparkline (last 8 snapshot totals, oldest first). */
  sparkline: VisualSpecV2 | null;
}

export function emptyProgressBlock(): DossierProgressBlock {
  return { available: false, periodStart: null, periodEnd: null, item: null, deadlines: [], lastSendAt: null, sinceAssessment: null, sparkline: null };
}

export function sparklineFrom(item: EvaluatorProgressItem | null): VisualSpecV2 | null {
  if (!item || item.scoreHistory.length === 0) return null;
  return makeVisual({
    id: `dossier-progress-${item.evaluationId}`,
    kind: "sparkline",
    title: "SVI — last snapshots",
    subtitle: item.delta !== null ? `Δ ${item.delta >= 0 ? "+" : ""}${item.delta} this period` : "one snapshot so far",
    agentId: "cdo",
    dataState: "real",
    data: { points: item.scoreHistory.map((value, i) => ({ label: `#${i + 1}`, value })), unit: "SVI" },
    a11y: { tableFallback: item.scoreHistory.map((value, i) => ({ snapshot: i + 1, svi: value })) },
  });
}

export interface ProgressInputs {
  evaluationId: string;
  /** The seat whose radar / progress sends are read (the evaluator, for both roles). */
  evaluatorUserId: string;
  latestSvi: number | null;
  /** assessor's current assessment (null for the founder preview). */
  mine: Pick<EvaluationAssessment, "version" | "snapshotId" | "updatedAt" | "submittedAt"> | null;
}

/** Block 5 reader — radar scoped to one evaluation + last send + since-assessment. */
export async function readProgressBlock(input: ProgressInputs, now: Date = new Date()): Promise<DossierProgressBlock> {
  const db = getSupabaseAdmin();
  if (!db) return emptyProgressBlock();
  const out = emptyProgressBlock();

  try {
    const base = createSupabaseProgressStore(db as never);
    const store = { ...base, listEvaluations: async (uid: string) => (await base.listEvaluations(uid)).filter((e) => e.id === input.evaluationId) };
    const progress = await buildEvaluatorProgress({ userId: input.evaluatorUserId, store, now });
    out.available = true;
    out.periodStart = progress.periodStart;
    out.periodEnd = progress.periodEnd;
    out.item = progress.items.find((i) => i.evaluationId === input.evaluationId) ?? null;
    out.deadlines = progress.deadlines.filter((d) => d.evaluationId === input.evaluationId);
    out.sparkline = sparklineFrom(out.item);
  } catch {
    /* radar unavailable — the rest still renders */
  }

  try {
    const { data } = await db.from("evaluator_progress_sends").select("sent_at").eq("user_id", input.evaluatorUserId).order("sent_at", { ascending: false }).limit(1).maybeSingle();
    const sentAt = (data as Row | null)?.sent_at;
    out.lastSendAt = typeof sentAt === "string" ? sentAt : null;
  } catch {
    /* 0321 not applied */
  }

  if (input.mine?.snapshotId) {
    try {
      const { data } = await db.from("svi_snapshots").select("id, svi_total, created_at").eq("id", input.mine.snapshotId).maybeSingle();
      const sviThen = data ? num((data as Row).svi_total) : null;
      const sviNow = input.latestSvi;
      out.sinceAssessment = {
        version: input.mine.version,
        snapshotId: input.mine.snapshotId,
        assessedAt: input.mine.submittedAt ?? input.mine.updatedAt,
        sviThen,
        sviNow,
        delta: sviThen !== null && sviNow !== null ? Math.round((sviNow - sviThen) * 10) / 10 : null,
      };
    } catch {
      /* snapshot gone — no callout */
    }
  }
  return out;
}

// ─── Header — mandate fit ────────────────────────────────────────────────────

export interface DossierMandateFit {
  mandateId: string;
  mandateLabel: string;
  score: number;
  passesFloor: boolean;
  reasons: string[];
  gaps: string[];
  blockers: string[];
  /** "persisted" = nightly mandate_fit_scores row; "computed" = scoreFit on read (no row yet). */
  source: "persisted" | "computed";
  computedAt: string | null;
}

export interface FitInputs {
  viewerUserId: string;
  projectId: string;
  taxonomy: StartupTaxonomyRow | null;
  svi: number | null;
  stage: number | null;
  state: string | null;
}

/** Pure: the FitStartup the S-T2 scorer expects, from what the dossier already loaded. */
export function fitStartupFrom(input: Pick<FitInputs, "projectId" | "taxonomy" | "svi" | "stage" | "state">): FitStartup {
  const t = input.taxonomy;
  return {
    project_id: input.projectId,
    // Defensive on every array/nullable: a taxonomy row read before 0394's
    // later columns landed (or a partial test fixture) must not throw inside
    // the scorer.
    taxonomy: t
      ? {
          industry: t.industry ?? "unclassified",
          industry_secondary: t.industry_secondary ?? null,
          business_model: t.business_model ?? "unclassified",
          customer_types: Array.isArray(t.customer_types) ? t.customer_types : [],
          stage_key: t.stage_key ?? "idea",
          hq_state: t.hq_state ?? null,
          hq_country: t.hq_country ?? "AU",
          geo_scope: t.geo_scope ?? null,
          tags: Array.isArray(t.tags) ? t.tags : [],
        }
      : null,
    svi: input.svi,
    stage_key: input.stage !== null ? stageKeyFromNumber(input.stage) : null,
    state: input.state,
    revenue_aud: null,
    growth_pct: null,
    raise_aud: null,
  };
}

/** Pure: a fit summary from a computed result. */
export function fitFromResult(mandate: Pick<FitMandate, "id"> & { label: string }, r: FitResult, source: DossierMandateFit["source"], computedAt: string | null): DossierMandateFit {
  return { mandateId: String(mandate.id ?? ""), mandateLabel: mandate.label, score: r.score, passesFloor: r.passes_floor, reasons: r.reasons, gaps: r.gaps, blockers: r.blockers, source, computedAt };
}

/** Header fit reader (assessor only): persisted row for the primary mandate, else scoreFit on read. */
export async function readMandateFit(input: FitInputs): Promise<DossierMandateFit | null> {
  const list = await listMandates(input.viewerUserId).catch(() => null);
  const mandate = list?.primary ?? null;
  if (!mandate) return null;
  const db = getSupabaseAdmin();
  if (db) {
    try {
      const { data, error } = await db.from("mandate_fit_scores").select("score, reasons, gaps, blockers, computed_at").eq("mandate_id", mandate.id).eq("project_id", input.projectId).maybeSingle();
      if (!error && data) {
        const r = data as Row;
        const score = num(r.score) ?? 0;
        return {
          mandateId: mandate.id,
          mandateLabel: mandate.label,
          score,
          passesFloor: score >= 40,
          reasons: Array.isArray(r.reasons) ? (r.reasons as string[]) : [],
          gaps: Array.isArray(r.gaps) ? (r.gaps as string[]) : [],
          blockers: Array.isArray(r.blockers) ? (r.blockers as string[]) : [],
          source: "persisted",
          computedAt: typeof r.computed_at === "string" ? r.computed_at : null,
        };
      }
    } catch {
      /* 0393 not applied — compute below */
    }
  }
  return fitFromResult(mandate, scoreFit(mandate, fitStartupFrom(input)), "computed", null);
}

// ─── Header — Δ since last view ──────────────────────────────────────────────

export interface DossierSinceLastView {
  viewedAt: string;
  sviThen: number | null;
  sviNow: number | null;
  /** SVI now − SVI at the previous view; null when the previous view carried no score. */
  delta: number | null;
}

export async function readSinceLastView(viewerUserId: string, evaluationId: string, sviNow: number | null): Promise<DossierSinceLastView | null> {
  const last = await readLastDossierView(viewerUserId, evaluationId);
  if (!last) return null;
  const sviThen = last.sviTotal;
  return { viewedAt: last.viewedAt, sviThen, sviNow, delta: sviThen !== null && sviNow !== null ? Math.round((sviNow - sviThen) * 10) / 10 : null };
}
