// Report-quality telemetry (G19-S46, docs/plans/g19-report-quality-2026-09-20.md §0 row 6).
//
// Every Trusted Business Report run that goes through `run-for-project.ts`
// appends ONE line to `content/reports/tbr-quality.jsonl`:
//
//   { ts, projectId (sha256 prefix, never the uuid), snapshotId, tier, calls,
//     costUsd, groundedShare, degradedSections, consistencyIssues,
//     pendingDims (S41 `assessed:false` chapters), words, pages, durationMs,
//     sviVersion, pipelineVersion,
//     providers_struck?, deadline_hit_wave? (G29-B — degraded runs only) }
//
// Readers:
//   /api/status.tbr_quality   summariseTbrQuality() over the last 24 h —
//                             runs, groundedShare median, costUsd median,
//                             degradedShare (runs with ≥ 1 degraded chapter ÷
//                             runs) and a one-word verdict: `ok` | `watch`
//                             (median grounded < 0.85 or degradedShare > 0.2)
//                             | `down` (G33-T01: most runs produced no report —
//                             ≥ 2 no-report runs and at least half the window,
//                             or the two latest runs both produced none)
//                             | `missing` (no run in the window); G29-B adds
//                             `last_degraded` — the latest no-report run's
//                             { ts, providers_struck, deadline_hit_wave }.
//   /admin report KPI tile    the same reducer (lib/admin/report-kpis.ts).
//
// Rules (mirrors pipeline-health.ts): best effort — the writer never throws
// and never fails a report; the file lives in the LIVE web checkout
// (`getStatusRoot()`, G15 review: the release dir is a build-time copy);
// no-op under vitest unless a writer is injected or TBR_QUALITY_FILE is set.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getStatusRoot, readJsonlTail, withinLast } from "@/lib/status/jsonl";
import { estimatePages } from "@/lib/report-v2/page-estimate";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { FULLY_DEGRADED_MIN_CHAPTERS } from "./pipeline-health";

export const TBR_QUALITY_FILE = "tbr-quality.jsonl";
export const TBR_QUALITY_PATH = path.join("content", "reports", TBR_QUALITY_FILE);

/**
 * §5 KPI: groundedShare ≥ 0.85 — grounded sections ÷ all audited sections
 * (executive + 8 chapters + 13 criterion sections) on a run, and the median
 * over the 24 h window for the status verdict. Exported for /api/status
 * (`grounded_share_kpi`) and the admin KPI tile (G23-A / lane C).
 */
export const TBR_GROUNDED_SHARE_KPI = 0.85;
/** Status verdict threshold — the KPI itself. */
export const TBR_QUALITY_GROUNDED_WATCH = TBR_GROUNDED_SHARE_KPI;
/** More than one run in five with a degraded chapter → `watch`. */
export const TBR_QUALITY_DEGRADED_WATCH = 0.2;
export const TBR_QUALITY_WINDOW_MS = 24 * 60 * 60 * 1000;
/** G33-T01: fewest no-report runs in the window before the verdict can be `down`. */
export const TBR_QUALITY_DOWN_MIN_RUNS = 2;
/** Tail read for the 24 h window — far more than a day of runs at the current volume. */
export const TBR_QUALITY_TAIL_LINES = 2000;

export interface TbrQualityRow {
  ts: string;
  /** First 12 hex of sha256(projectId); "anonymous" without one. */
  projectId: string;
  snapshotId: string | null;
  tier: string;
  calls: number;
  costUsd: number;
  groundedShare: number;
  degradedSections: number;
  consistencyIssues: number;
  /** Chapters whose S41 ledger says `assessed: false` (rendered as "pending"). */
  pendingDims: number;
  words: number;
  pages: number;
  durationMs: number;
  sviVersion: string;
  pipelineVersion: string;
  /** G23-A: structured calls whose output was cut by its token budget (salvaged or repaired). */
  budgetOverruns?: number;
  /** G23-A: W4 verdicts trimmed to their word cap instead of failing the chapter. */
  verdictTrimmed?: number;
  /** G23-A: material claims that received an evidence id from the auto-citer. */
  autoCited?: number;
  /** G29-B (degraded runs): providers the run-scoped strike ledger struck out (names only). */
  providers_struck?: string[];
  /** G29-B (degraded runs): the wave whose wall-clock race the deadline won; null when the deadline never fired. */
  deadline_hit_wave?: string | null;
}

/** G29-B: the most recent no-report (fully degraded) run — what /api/status and /admin/funnel print instead of a placeholder share. */
export interface TbrLastDegraded {
  ts: string;
  providers_struck: string[];
  deadline_hit_wave: string | null;
}

export interface TbrQualityWindow {
  runs: number;
  /** Median over runs that produced a report (a fully degraded run has no prose to ground and is excluded here, but counts in degradedShare). */
  groundedShareMedian: number | null;
  /** groundedShare of the most recent run that produced a report, null without one. */
  groundedShareLatest: number | null;
  costUsdMedian: number | null;
  /** Runs with ≥ 1 degraded chapter ÷ runs; null when there were no runs. */
  degradedShare: number | null;
  /** G33-T01: runs that produced no report at all (fully degraded) — the outage count behind `down`. */
  noReportRuns: number;
  /** G23-A counters summed over the window. */
  budgetOverruns: number;
  verdictTrimmed: number;
}

export type TbrQualityVerdict = "ok" | "watch" | "down" | "missing";

export interface TbrQualityStatus {
  last24h: TbrQualityWindow;
  status: TbrQualityVerdict;
  /** The KPI the verdict is judged against (TBR_GROUNDED_SHARE_KPI). */
  grounded_share_kpi: number;
  /** G29-B: the latest no-report run in the window (excluded from the grounding median, named here); null when every run produced a report. */
  last_degraded: TbrLastDegraded | null;
}

const EMPTY_WINDOW: TbrQualityWindow = { runs: 0, groundedShareMedian: null, groundedShareLatest: null, costUsdMedian: null, degradedShare: null, noReportRuns: 0, budgetOverruns: 0, verdictTrimmed: 0 };

/** The `missing` status (no run in the window / unreadable file) — shared with the /api/status fallback. */
export function emptyTbrQualityStatus(): TbrQualityStatus {
  return { last24h: { ...EMPTY_WINDOW }, status: "missing", grounded_share_kpi: TBR_GROUNDED_SHARE_KPI, last_degraded: null };
}

export type TbrQualityWriter = (row: TbrQualityRow) => void | Promise<void>;

export function projectHash(projectId: string | null | undefined): string {
  if (!projectId) return "anonymous";
  return createHash("sha256").update(projectId).digest("hex").slice(0, 12);
}

const r4 = (x: number) => Math.round(x * 10_000) / 10_000;

function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
const nonNeg = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.max(0, x) : 0);

/** Pure: shape one telemetry row from a finished run (exported for tests and the self-report script). */
export function buildTbrQualityRow(input: {
  projectId: string | null | undefined;
  snapshotId: string | null | undefined;
  tier: string;
  report: ReportV2 | null | undefined;
  calls: number;
  costUsd: number;
  durationMs: number;
  /** AssembledReport.totalWords — the prose the founder receives (the ReportV2 estimate is the fallback). */
  words?: number;
  /** AssembledReport.consistencyIssues length (the gate issues); falls back to the ReportV2 list. */
  consistencyIssues?: number;
  /** Override for a run that produced no ReportV2 (fully degraded → 8). */
  degradedSections?: number;
  sviVersion: string;
  pipelineVersion?: string;
  now?: Date;
  /** G23-A counters from the orchestrator’s `done` event. */
  budgetOverruns?: number;
  verdictTrimmed?: number;
  autoCited?: number;
  /** G29-B: written only when given (degraded runs) — provider names from the run-scoped strike ledger. */
  providersStruck?: string[];
  /** G29-B: written only when given (degraded runs). */
  deadlineHitWave?: string | null;
}): TbrQualityRow {
  const report = input.report ?? null;
  const est = report ? estimatePages(report) : null;
  const pendingDims = report ? report.dimensions.filter((d) => d.scoreBreakdown?.assessed === false).length : 0;
  return {
    ts: (input.now ?? new Date()).toISOString(),
    projectId: projectHash(input.projectId),
    snapshotId: input.snapshotId ?? null,
    tier: input.tier,
    calls: Math.floor(nonNeg(input.calls)),
    costUsd: r4(nonNeg(input.costUsd)),
    groundedShare: report ? r4(Math.min(1, nonNeg(report.quality.groundedShare))) : 0,
    degradedSections: typeof input.degradedSections === "number" ? Math.floor(nonNeg(input.degradedSections)) : report ? report.quality.degradedSections.length : 0,
    consistencyIssues: typeof input.consistencyIssues === "number" ? Math.floor(nonNeg(input.consistencyIssues)) : report ? report.quality.consistencyIssues.length : 0,
    pendingDims,
    words: typeof input.words === "number" ? Math.floor(nonNeg(input.words)) : est ? est.words : 0,
    pages: est ? Math.round(est.pages * 10) / 10 : 0,
    durationMs: Math.floor(nonNeg(input.durationMs)),
    sviVersion: input.sviVersion,
    pipelineVersion: input.pipelineVersion ?? report?.pipelineVersion ?? "",
    budgetOverruns: Math.floor(nonNeg(input.budgetOverruns)),
    verdictTrimmed: Math.floor(nonNeg(input.verdictTrimmed)),
    autoCited: Math.floor(nonNeg(input.autoCited)),
    ...(input.providersStruck !== undefined ? { providers_struck: input.providersStruck.filter((p) => typeof p === "string" && p.length > 0).slice(0, 12) } : {}),
    ...(input.deadlineHitWave !== undefined ? { deadline_hit_wave: input.deadlineHitWave ?? null } : {}),
  };
}

/**
 * G28-B rule: a run that produced no report (words 0, ≥ FULLY_DEGRADED_MIN_CHAPTERS
 * chapters deterministic) has nothing to ground — it counts in degradedShare,
 * never in the grounding median / the "latest share" (quality-log + tbr-grounding).
 */
export function isNoReportRow(row: { words?: unknown; degradedSections?: unknown } | null | undefined): boolean {
  return Boolean(row) && row!.words === 0 && typeof row!.degradedSections === "number" && row!.degradedSections >= FULLY_DEGRADED_MIN_CHAPTERS;
}

/** G29-B: the row's degraded diagnostics in the status shape (fail-soft on legacy rows without them). */
export function lastDegradedOf(row: RowLike): TbrLastDegraded {
  const struck = Array.isArray(row.providers_struck) ? row.providers_struck.filter((p): p is string => typeof p === "string" && p.length > 0).slice(0, 12) : [];
  const wave = typeof row.deadline_hit_wave === "string" && row.deadline_hit_wave ? row.deadline_hit_wave : null;
  return { ts: typeof row.ts === "string" ? row.ts : "", providers_struck: struck, deadline_hit_wave: wave };
}

function qualityFilePath(): string {
  return process.env.TBR_QUALITY_FILE || path.join(getStatusRoot(), TBR_QUALITY_PATH);
}

function isTestEnv(): boolean {
  return Boolean(process.env.VITEST) || process.env.NODE_ENV === "test";
}

/** Default writer: append one JSON line to the live checkout; swallow every error. */
export const appendTbrQualityRow: TbrQualityWriter = (row) => {
  if (isTestEnv() && !process.env.TBR_QUALITY_FILE) return;
  const file = qualityFilePath();
  return fs
    .mkdir(path.dirname(file), { recursive: true })
    .then(() => fs.appendFile(file, JSON.stringify(row) + "\n"))
    .catch(() => {
      /* telemetry must never fail a report */
    });
};

/** Record one run. Never throws; the writer is injectable (tests, the self-report script). */
export function recordTbrQuality(row: TbrQualityRow, writer: TbrQualityWriter = appendTbrQualityRow): TbrQualityRow {
  try {
    const r = writer(row);
    if (r && typeof (r as Promise<void>).catch === "function") (r as Promise<void>).catch(() => undefined);
  } catch {
    /* never throw */
  }
  return row;
}

/**
 * Awaited variant for async callers: the row is on disk before the caller
 * returns (the self-report script `process.exit`s right after the run — a
 * fire-and-forget append never flushed). Still never throws.
 */
export async function recordTbrQualityAsync(row: TbrQualityRow, writer: TbrQualityWriter = appendTbrQualityRow): Promise<TbrQualityRow> {
  try {
    await writer(row);
  } catch {
    /* never throw */
  }
  return row;
}

/** One human-readable line for logs / the self-report script. */
export function formatTbrQualityLine(row: TbrQualityRow): string {
  const degraded = row.providers_struck !== undefined || row.deadline_hit_wave !== undefined ? ` providers_struck=${row.providers_struck?.length ? row.providers_struck.join(",") : "-"} deadline_hit_wave=${row.deadline_hit_wave ?? "-"}` : "";
  return `[tbr-quality] tier=${row.tier} calls=${row.calls} cost_usd=${row.costUsd.toFixed(4)} grounded=${row.groundedShare.toFixed(2)} degraded=${row.degradedSections} consistency=${row.consistencyIssues} pending_dims=${row.pendingDims} words=${row.words} pages=${row.pages} ms=${row.durationMs} budget_overruns=${row.budgetOverruns ?? 0} verdict_trimmed=${row.verdictTrimmed ?? 0} auto_cited=${row.autoCited ?? 0} snapshot=${row.snapshotId ?? "-"}${degraded}`;
}

type RowLike = Partial<Record<keyof TbrQualityRow, unknown>>;

/** Pure reducer over jsonl rows — exported for tests. */
export function summariseTbrQuality(rows: RowLike[], now: number = Date.now(), windowMs: number = TBR_QUALITY_WINDOW_MS): TbrQualityStatus {
  const grounded: Array<{ ts: string; share: number }> = [];
  const cost: number[] = [];
  let runs = 0;
  let degradedRuns = 0;
  let noReportRuns = 0;
  // G33-T01: every run's (ts, produced-a-report) — the two latest decide `down` too.
  const outcomes: Array<{ ts: number; noReport: boolean }> = [];
  let budgetOverruns = 0;
  let verdictTrimmed = 0;
  // G29-B: the latest no-report row (by ts, position breaks ties) → last_degraded.
  let lastDegraded: { ts: number; row: RowLike } | null = null;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    if (!withinLast(row.ts, windowMs, now)) continue;
    runs += 1;
    // A run that produced no report (fully degraded: no prose, every chapter
    // deterministic) has nothing to ground — it counts in degradedShare, not
    // in the grounding median (G23-A; the 2026-09-20/21 outage rows were
    // groundedShare 0 with words 0 and dragged a 0.41 median to 0).
    const noReport = isNoReportRow(row);
    const parsedTs = Date.parse(String(row.ts));
    const at = Number.isFinite(parsedTs) ? parsedTs : -Infinity;
    outcomes.push({ ts: at, noReport });
    if (noReport) {
      noReportRuns += 1;
      if (!lastDegraded || at >= lastDegraded.ts) lastDegraded = { ts: at, row };
    }
    if (!noReport && typeof row.groundedShare === "number" && Number.isFinite(row.groundedShare)) grounded.push({ ts: String(row.ts), share: row.groundedShare });
    if (typeof row.costUsd === "number" && Number.isFinite(row.costUsd)) cost.push(row.costUsd);
    if (typeof row.degradedSections === "number" && row.degradedSections > 0) degradedRuns += 1;
    if (typeof row.budgetOverruns === "number" && Number.isFinite(row.budgetOverruns)) budgetOverruns += Math.max(0, row.budgetOverruns);
    if (typeof row.verdictTrimmed === "number" && Number.isFinite(row.verdictTrimmed)) verdictTrimmed += Math.max(0, row.verdictTrimmed);
  }
  if (runs === 0) return { last24h: { ...EMPTY_WINDOW }, status: "missing", grounded_share_kpi: TBR_GROUNDED_SHARE_KPI, last_degraded: null };
  const groundedMed = median(grounded.map((g) => g.share));
  const latest = grounded.length ? [...grounded].sort((a, b) => a.ts.localeCompare(b.ts))[grounded.length - 1]!.share : null;
  const costMed = median(cost);
  const degradedShare = Math.round((degradedRuns / runs) * 100) / 100;
  const watch = (groundedMed !== null && groundedMed < TBR_QUALITY_GROUNDED_WATCH) || degradedShare > TBR_QUALITY_DEGRADED_WATCH;
  // G33-T01: an outage is not a "watch". Most of the window produced nothing, or
  // the two latest runs both produced nothing (stable sort keeps file order on ties).
  const latestTwo = outcomes
    .map((o, i) => ({ ...o, i }))
    .sort((a, b) => a.ts - b.ts || a.i - b.i)
    .slice(-2);
  const down =
    (noReportRuns >= TBR_QUALITY_DOWN_MIN_RUNS && noReportRuns * 2 >= runs) ||
    (latestTwo.length === 2 && latestTwo.every((o) => o.noReport));
  return {
    last24h: {
      runs,
      groundedShareMedian: groundedMed === null ? null : Math.round(groundedMed * 100) / 100,
      groundedShareLatest: latest === null ? null : Math.round(latest * 100) / 100,
      costUsdMedian: costMed === null ? null : r4(costMed),
      degradedShare,
      noReportRuns,
      budgetOverruns,
      verdictTrimmed,
    },
    status: down ? "down" : watch ? "watch" : "ok",
    grounded_share_kpi: TBR_GROUNDED_SHARE_KPI,
    last_degraded: lastDegraded ? lastDegradedOf(lastDegraded.row) : null,
  };
}

/** The /api/status section. Never throws; names no path or project. */
export async function readTbrQualityStatus(root: string = getStatusRoot(), now: number = Date.now()): Promise<TbrQualityStatus> {
  try {
    const rows = await readJsonlTail<RowLike>(root, TBR_QUALITY_FILE, TBR_QUALITY_TAIL_LINES);
    return summariseTbrQuality(rows, now);
  } catch {
    return { last24h: { ...EMPTY_WINDOW }, status: "missing", grounded_share_kpi: TBR_GROUNDED_SHARE_KPI, last_degraded: null };
  }
}
