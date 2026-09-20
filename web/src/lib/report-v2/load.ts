// ReportV2 server loader — one place that turns an `svi_snapshots` row into
// the document every non-web surface renders (PDF, DOCX, email). S-R4.
//
//   loadReportV2ByShareToken(token)   → public /tbr/[token] artefacts
//   loadLatestReportV2ForAccount(...)  → founder exports (DOCX, email)
//   reportV2FromSnapshotRow(row, ctx)  → pure projection (stored column
//                                         wins, adapter otherwise)
//
// Same rule as the web client and the dossier: a stored `report_v2` that
// validates is used as-is (`source: "pipeline"`); anything else goes
// through `adapter.fromSnapshot` on read (`source: "adapter"`), so a report
// generated before migration 0395 / S-R3 still renders every chapter.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fromSnapshot, resolveReportV2, scoreBreakdownFromSub, type SnapshotCriterionState, type SnapshotDimState, type SnapshotInput, type SubScoreLike, type SviAnalysisLike } from "./adapter";
import { isReportV2, type ReportTierV2, type ReportV2 } from "./schema";
import { readSnapshotReportV2 } from "./storage";
import { primeComparables } from "@/lib/valuation/comparables-repo.server";
import { loadVerificationLevel } from "@/lib/verification/load-level";

type Row = Record<string, unknown>;

export interface SnapshotRowLike {
  id: string;
  account_id?: string | null;
  project_id?: string | null;
  svi_total?: number | null;
  stage?: number | null;
  created_at: string;
  criterion_results?: unknown;
  dim_results?: unknown;
  dimension_scores?: unknown;
  analysis_json?: unknown;
  report_v2?: unknown;
  report_share_token?: string | null;
}

export const SNAPSHOT_REPORT_COLUMNS = "id, account_id, project_id, svi_total, stage, created_at, criterion_results, dim_results, dimension_scores, analysis_json, report_share_token";

const DIM_KEYS = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"] as const;

/** `dim_results` (or bare `dimension_scores`) → adapter input. */
export function dimStatesFromRow(row: Pick<SnapshotRowLike, "dim_results" | "dimension_scores">): Record<string, SnapshotDimState> {
  const out: Record<string, SnapshotDimState> = {};
  const dr = row.dim_results && typeof row.dim_results === "object" ? (row.dim_results as Record<string, Row>) : null;
  const ds = row.dimension_scores && typeof row.dimension_scores === "object" ? (row.dimension_scores as Record<string, unknown>) : {};
  for (const k of DIM_KEYS) {
    const v = dr?.[k];
    if (v && typeof v === "object") {
      out[k] = {
        status: typeof v.status === "string" ? v.status : "complete",
        score: typeof v.score === "number" ? v.score : null,
        markdown: typeof v.markdown === "string" ? v.markdown : null,
        insights: Array.isArray(v.insights) ? (v.insights as string[]) : [],
        priority: v.priority === "high" || v.priority === "medium" || v.priority === "low" ? v.priority : null,
        marketBenchmark: typeof v.marketBenchmark === "string" ? v.marketBenchmark : null,
      };
      continue;
    }
    const raw = ds[k];
    const score = typeof raw === "number" ? raw : raw && typeof raw === "object" && typeof (raw as Row).score === "number" ? ((raw as Row).score as number) : null;
    out[k] = { status: score == null ? "idle" : "complete", score, markdown: null, insights: [], priority: null, marketBenchmark: null };
  }
  return out;
}

export interface SnapshotReportContext {
  startupName?: string | null;
  industry?: string | null;
  stageLabel?: string | null;
  tier?: ReportTierV2;
  locale?: "en" | "vi";
  phaseId?: string | null;
  accountId?: string | null;
  /** G14-S36: projects.verification_level (0–5) — the cover badge. */
  verificationLevel?: number | null;
}

/** Adapter input for a snapshot row (exported so tests and the dossier can share it). */
export function snapshotInputFromRow(row: SnapshotRowLike, ctx: SnapshotReportContext = {}): SnapshotInput {
  const meta = (row.analysis_json && typeof row.analysis_json === "object" ? (row.analysis_json as Row) : {}) as { industry?: string | null; stageLabel?: string | null; startupName?: string | null };
  // G19-S41: `analysis_json` is the SVIAnalysis — snapshots written after S41
  // carry `subs[].breakdown` + `ledger`, which become the chapter / cover
  // ledgers. Older rows simply have none (no ledger rendered, band unchanged).
  const analysis = meta as SviAnalysisLike & { subs?: SubScoreLike[] };
  const subByKey = new Map((Array.isArray(analysis.subs) ? analysis.subs : []).map((s) => [s.key, s] as const));
  const dimStates = dimStatesFromRow(row);
  for (const k of DIM_KEYS) {
    const bd = scoreBreakdownFromSub(subByKey.get(k), analysis);
    if (bd && dimStates[k]) dimStates[k] = { ...dimStates[k], scoreBreakdown: bd };
  }
  return {
    snapshotId: row.id,
    projectId: row.project_id ?? null,
    accountId: ctx.accountId ?? row.account_id ?? null,
    createdAt: row.created_at,
    startupName: ctx.startupName ?? meta.startupName ?? null,
    industry: ctx.industry ?? meta.industry ?? null,
    stageLabel: ctx.stageLabel ?? meta.stageLabel ?? null,
    stage: typeof row.stage === "number" ? row.stage : null,
    sviTotal: typeof row.svi_total === "number" && Number.isFinite(row.svi_total) ? row.svi_total : null,
    dimStates,
    sviLedger: analysis.ledger ?? null,
    criterionStates: Array.isArray(row.criterion_results) ? (row.criterion_results as SnapshotCriterionState[]) : null,
    phaseId: ctx.phaseId ?? null,
    verificationLevel: ctx.verificationLevel ?? null,
    // Free-tier ≤10-page gate needs the stored tier: prefer the caller's, then
    // the snapshot's own `analysis_json.tier`, never a silent "standard" (W4 review).
    tier: ctx.tier ?? snapshotTier(row) ?? "standard",
    locale: ctx.locale ?? "en",
  };
}

/** Pure: stored `report_v2` when valid, else the read-time adapter. */
export function reportV2FromSnapshotRow(row: SnapshotRowLike, ctx: SnapshotReportContext = {}): ReportV2 {
  const report = resolveReportV2(row.report_v2, snapshotInputFromRow(row, ctx), isReportV2);
  // A stored document keeps its own tier; a caller-forced tier (free export
  // of a standard snapshot) is honoured only through the adapter path.
  return ctx.tier && report.source !== "pipeline" && report.tier !== ctx.tier ? fromSnapshot({ ...snapshotInputFromRow(row, ctx), tier: ctx.tier }) : report;
}

export interface LoadedReportV2 {
  report: ReportV2;
  snapshotId: string;
  projectId: string | null;
  accountId: string | null;
  shareToken: string | null;
  /** "stored" = svi_snapshots.report_v2 validated; "adapter" = built on read. */
  path: "stored" | "adapter";
}

async function finish(db: SupabaseClient, row: SnapshotRowLike, ctx: SnapshotReportContext): Promise<LoadedReportV2> {
  // S-R5: the adapter path cites the live comparables count — warm the cache first (no-op when fresh).
  // S36: the adapter path also stamps the cover badge from projects.verification_level (read-only, never throws).
  const [stored, verificationLevel] = await Promise.all([
    readSnapshotReportV2(db, row.id),
    ctx.verificationLevel === undefined ? loadVerificationLevel(db, row.project_id) : Promise.resolve(ctx.verificationLevel),
    primeComparables().catch(() => undefined),
  ]);
  const report = reportV2FromSnapshotRow({ ...row, report_v2: stored }, { ...ctx, verificationLevel });
  return {
    report,
    snapshotId: row.id,
    projectId: row.project_id ?? null,
    accountId: row.account_id ?? null,
    shareToken: row.report_share_token ?? null,
    path: stored ? "stored" : "adapter",
  };
}

/** Startup name for a snapshot's account (best effort, one read). */
async function accountName(db: SupabaseClient, accountId: string | null | undefined): Promise<string | null> {
  if (!accountId) return null;
  try {
    const { data } = await db.from("svi_accounts").select("startup_name").eq("id", accountId).maybeSingle();
    const name = (data as { startup_name?: unknown } | null)?.startup_name;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
}

/** The report behind a public share token (null = unknown token / no DB). */
export async function loadReportV2ByShareToken(token: string, ctx: SnapshotReportContext = {}, db: SupabaseClient | null = getSupabaseAdmin()): Promise<LoadedReportV2 | null> {
  if (!db || !token) return null;
  const { data, error } = await db.from("svi_snapshots").select(SNAPSHOT_REPORT_COLUMNS).eq("report_share_token", token).maybeSingle();
  if (error || !data) return null;
  const row = data as SnapshotRowLike;
  const startupName = ctx.startupName ?? (await accountName(db, row.account_id));
  return finish(db, row, { ...ctx, startupName });
}

/** Latest snapshot for an account (optionally pinned to a project), or null. */
export async function loadLatestReportV2ForAccount(
  accountId: string,
  projectId: string | null,
  ctx: SnapshotReportContext = {},
  db: SupabaseClient | null = getSupabaseAdmin(),
): Promise<LoadedReportV2 | null> {
  if (!db || !accountId) return null;
  let q = db.from("svi_snapshots").select(SNAPSHOT_REPORT_COLUMNS).eq("account_id", accountId).order("created_at", { ascending: false }).limit(1);
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q.maybeSingle();
  if (error || !data) return null;
  return finish(db, data as SnapshotRowLike, { ...ctx, accountId });
}

/** One snapshot by id (the evaluator TBR / email paths know the id). */
export async function loadReportV2BySnapshotId(snapshotId: string, ctx: SnapshotReportContext = {}, db: SupabaseClient | null = getSupabaseAdmin()): Promise<LoadedReportV2 | null> {
  if (!db || !snapshotId) return null;
  const { data, error } = await db.from("svi_snapshots").select(SNAPSHOT_REPORT_COLUMNS).eq("id", snapshotId).maybeSingle();
  if (error || !data) return null;
  const row = data as SnapshotRowLike;
  const startupName = ctx.startupName ?? (await accountName(db, row.account_id));
  return finish(db, row, { ...ctx, startupName });
}

function snapshotTier(row: { analysis_json?: unknown; tier?: unknown }): "free" | "standard" | "premium" | "investor_memo" | null {
  const raw = (row.tier ?? (row.analysis_json && typeof row.analysis_json === "object" ? (row.analysis_json as { tier?: unknown }).tier : null)) as unknown;
  if (raw === "free" || raw === "standard" || raw === "premium" || raw === "investor_memo") return raw;
  if (raw === "preview") return "free";
  return null;
}
