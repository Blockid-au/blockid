// batch-shared — client-safe types + pure helpers for Program batch scoring
// (T0272, G12 sprint S5; docs/plans/evaluator-traction-2026-09-10.md §3c-7).
//
// No "server-only", no Supabase: the weight sliders in the batch dialog, the
// sortable cohort table, the CSV export and the sponsor/LP report all read
// from here. The DB layer is ./batch.ts.
//
// Rubric weights. The SVI pipeline (computeSVI in lib/svi-analysis.ts and
// orchestrateReport behind runTrustReportForProject) has NO weight input —
// the 8 dimension scores and the SVI total are computed the same way for
// every startup, which is the whole point of "one rubric". A Program's
// custom rubric weights therefore never change the SVI; they re-aggregate
// the 8 stored dimension scores into the DISPLAYED "weighted score" column
// of the cohort table, the CSV and the sponsor report (weightedScore()).
// Equal weights (12.5 each) reproduce a plain mean of the dimensions.

export const DIMENSION_KEYS = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"] as const;
export type DimensionKey = (typeof DIMENSION_KEYS)[number];

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  ftv: "Founder & Team",
  mpc: "Market & Problem",
  ptd: "Product & Technical",
  tre: "Traction & Revenue",
  cgh: "Cap Table & Governance",
  iri: "Investor Readiness",
  lco: "Legal & Compliance",
  svm: "Strategic Vision & Moat",
};

export type RubricWeights = Record<DimensionKey, number>;

// Gate vocabulary (plans.csv / tier-ladder.ts). Program (investor_vc_small)
// carries lp_export + lp_report; the accelerator_* Contact-Sales rows carry
// accelerator.cohort (and Enterprise lp_report). Scout / Firm carry none.
export const BATCH_FEATURES = ["lp_export", "accelerator.cohort"] as const;
export const LP_REPORT_FEATURES = ["lp_report", "lp_export"] as const;

export function canBatchScore(flags: readonly string[]): boolean {
  return BATCH_FEATURES.some((f) => flags.includes(f));
}

export function canExportLpReport(flags: readonly string[]): boolean {
  return LP_REPORT_FEATURES.some((f) => flags.includes(f));
}

export const BATCH_STATUSES = ["queued", "running", "done", "failed"] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

/** Hard cap per batch — one Program month of included reports is 100. */
export const BATCH_MAX_ITEMS = 200;
/** Items scored per cron tick (each is a full 13-agent report). */
export const BATCH_ITEMS_PER_TICK = 5;

export interface EvaluationBatch {
  id: string;
  userId: string;
  name: string;
  rubricWeights: RubricWeights;
  status: BatchStatus;
  total: number;
  doneCount: number;
  failedCount: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface EvaluationBatchItem {
  id: number;
  batchId: string;
  evaluationId: string;
  status: BatchStatus;
  reportId: string | null;
  snapshotId: string | null;
  shareToken: string | null;
  sviTotal: number | null;
  /** {ftv: 61, mpc: 48, …} — flattened from svi_snapshots.dimension_scores. */
  dimensionScores: Partial<Record<DimensionKey, number>> | null;
  error: string | null;
  scoredAt: string | null;
}

/** One row of the cohort table / CSV / sponsor report. */
export interface CohortRow {
  itemId: number;
  evaluationId: string;
  projectId: string;
  projectSlug: string;
  startup: string;
  label: string | null;
  industry: string | null;
  state: string | null;
  status: BatchStatus;
  svi: number | null;
  weighted: number | null;
  stage: number | null;
  /** SVI Δ vs the snapshot before this batch scored it; null when first score. */
  delta: number | null;
  topStrength: string | null;
  topGap: string | null;
  dimensionScores: Partial<Record<DimensionKey, number>> | null;
  reportUrl: string | null;
  pdfUrl: string | null;
  error: string | null;
  scoredAt: string | null;
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

export function equalWeights(): RubricWeights {
  return Object.fromEntries(DIMENSION_KEYS.map((k) => [k, 12.5])) as RubricWeights;
}

function finite(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalise arbitrary input to the 8 keys summing to 100 (two decimals).
 * Unknown keys are dropped, negatives clamp to 0, missing keys are 0.
 * Empty / all-zero / non-object input → equal weights (the default rubric).
 */
export function normaliseWeights(raw: unknown): RubricWeights {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return equalWeights();
  const src = raw as Record<string, unknown>;
  const out = {} as RubricWeights;
  let sum = 0;
  for (const k of DIMENSION_KEYS) {
    const n = Math.max(0, finite(src[k]) ?? 0);
    out[k] = n;
    sum += n;
  }
  if (sum <= 0) return equalWeights();
  for (const k of DIMENSION_KEYS) out[k] = Math.round((out[k] / sum) * 10000) / 100;
  return out;
}

/** True when the stored weights are the default equal rubric. */
export function isEqualWeights(w: RubricWeights): boolean {
  return DIMENSION_KEYS.every((k) => Math.abs(w[k] - 12.5) < 0.01);
}

/**
 * Weighted re-aggregation of the dimension scores present. Dimensions missing
 * from `scores` are excluded and the remaining weights are renormalised, so a
 * 7-dimension snapshot still yields a 0..100 number. Null when nothing scored.
 */
export function weightedScore(
  scores: Partial<Record<DimensionKey, number>> | null | undefined,
  weights: RubricWeights = equalWeights(),
): number | null {
  if (!scores) return null;
  let num = 0;
  let den = 0;
  for (const k of DIMENSION_KEYS) {
    const s = finite(scores[k]);
    if (s == null) continue;
    const w = Math.max(0, finite(weights[k]) ?? 0);
    num += s * w;
    den += w;
  }
  if (den <= 0) return null;
  return Math.round((num / den) * 10) / 10;
}

/** Highest / lowest scored dimension labels (ties → first in DIMENSION_KEYS order). */
export function strengthAndGap(
  scores: Partial<Record<DimensionKey, number>> | null | undefined,
): { topStrength: string | null; topGap: string | null } {
  if (!scores) return { topStrength: null, topGap: null };
  let best: DimensionKey | null = null;
  let worst: DimensionKey | null = null;
  for (const k of DIMENSION_KEYS) {
    const s = finite(scores[k]);
    if (s == null) continue;
    if (best == null || s > (scores[best] as number)) best = k;
    if (worst == null || s < (scores[worst] as number)) worst = k;
  }
  return {
    topStrength: best ? DIMENSION_LABELS[best] : null,
    topGap: worst ? DIMENSION_LABELS[worst] : null,
  };
}

/**
 * svi_snapshots.dimension_scores is `{ftv: {score, priority}}` (T0271 shape)
 * or a bare `{ftv: 61}` map from older writers — accept both.
 */
export function flattenDimensionScores(raw: unknown): Partial<Record<DimensionKey, number>> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: Partial<Record<DimensionKey, number>> = {};
  let any = false;
  for (const k of DIMENSION_KEYS) {
    const v = src[k];
    const n = v && typeof v === "object" ? finite((v as Record<string, unknown>).score) : finite(v);
    if (n == null) continue;
    out[k] = Math.round(n * 10) / 10;
    any = true;
  }
  return any ? out : null;
}

// ---------------------------------------------------------------------------
// Row mapping (shared by server + tests)
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function str(v: unknown): string | null {
  return v == null ? null : String(v);
}

function batchStatus(v: unknown): BatchStatus {
  return (BATCH_STATUSES as readonly string[]).includes(String(v)) ? (v as BatchStatus) : "queued";
}

export function mapBatchRow(row: Row): EvaluationBatch {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name ?? "Batch"),
    rubricWeights: normaliseWeights(row.rubric_weights),
    status: batchStatus(row.status),
    total: Number(row.total ?? 0) || 0,
    doneCount: Number(row.done_count ?? 0) || 0,
    failedCount: Number(row.failed_count ?? 0) || 0,
    createdAt: String(row.created_at ?? ""),
    startedAt: str(row.started_at),
    finishedAt: str(row.finished_at),
  };
}

export function mapBatchItemRow(row: Row): EvaluationBatchItem {
  const svi = finite(row.svi_total);
  return {
    id: Number(row.id),
    batchId: String(row.batch_id),
    evaluationId: String(row.evaluation_id),
    status: batchStatus(row.status),
    reportId: str(row.report_id),
    snapshotId: str(row.snapshot_id),
    shareToken: str(row.share_token),
    sviTotal: svi,
    dimensionScores: flattenDimensionScores(row.dimension_scores),
    error: str(row.error),
    scoredAt: str(row.scored_at),
  };
}

// ---------------------------------------------------------------------------
// Cohort helpers
// ---------------------------------------------------------------------------

export function median(values: number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : Math.round(((xs[mid - 1] + xs[mid]) / 2) * 10) / 10;
}

export function batchProgressPct(b: Pick<EvaluationBatch, "total" | "doneCount" | "failedCount">): number {
  if (b.total <= 0) return 0;
  return Math.min(100, Math.round(((b.doneCount + b.failedCount) / b.total) * 100));
}

export const STAGE_NAMES: Record<number, string> = {
  0: "Pre-idea",
  1: "Idea",
  2: "Validation",
  3: "MVP",
  4: "Early traction",
  5: "Growth",
  6: "Scale",
  7: "Mature",
};

export function stageName(stage: number | null | undefined): string {
  if (stage == null) return "—";
  return STAGE_NAMES[stage] ?? `Stage ${stage}`;
}

// ---------------------------------------------------------------------------
// CSV (Excel-safe: UTF-8 BOM, CRLF, RFC 4180 quoting, formula-injection guard)
// ---------------------------------------------------------------------------

export const CSV_BOM = "\uFEFF";

export function csvCell(v: unknown): string {
  if (v == null) return "";
  // A finite number can never be a formula — emit it bare so a negative
  // delta stays numeric in Excel (S8-C review 2026-09-11). NaN / ±Infinity
  // fall through to the string path.
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  let s = String(v);
  // A leading = + - @ or tab/CR would be executed by Excel as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const COHORT_CSV_HEADERS = [
  "Startup",
  "Label",
  "Industry",
  "State",
  "Status",
  "SVI",
  "Weighted score",
  "Stage",
  "Delta since last",
  "Top strength",
  "Top gap",
  ...DIMENSION_KEYS.map((k) => DIMENSION_LABELS[k]),
  "Report link",
  "Scored at",
  "Error",
] as const;

export function cohortCsv(rows: CohortRow[], base = "https://blockid.au"): string {
  const lines = [COHORT_CSV_HEADERS.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.startup,
        r.label,
        r.industry,
        r.state,
        r.status,
        r.svi,
        r.weighted,
        r.stage == null ? "" : stageName(r.stage),
        r.delta,
        r.topStrength,
        r.topGap,
        ...DIMENSION_KEYS.map((k) => r.dimensionScores?.[k] ?? ""),
        r.reportUrl ? `${base}${r.reportUrl}` : "",
        r.scoredAt,
        r.error,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return CSV_BOM + lines.join("\r\n") + "\r\n";
}

export function csvFilename(batch: Pick<EvaluationBatch, "name" | "createdAt">): string {
  const slug = batch.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "cohort";
  const day = batch.createdAt.slice(0, 10) || "export";
  return `cohort-${slug}-${day}.csv`;
}
