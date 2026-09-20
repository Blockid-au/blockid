// Report-quality telemetry (G19-S46, docs/plans/g19-report-quality-2026-09-20.md §0 row 6).
//
// Every Trusted Business Report run that goes through `run-for-project.ts`
// appends ONE line to `content/reports/tbr-quality.jsonl`:
//
//   { ts, projectId (sha256 prefix, never the uuid), snapshotId, tier, calls,
//     costUsd, groundedShare, degradedSections, consistencyIssues,
//     pendingDims (S41 `assessed:false` chapters), words, pages, durationMs,
//     sviVersion, pipelineVersion }
//
// Readers:
//   /api/status.tbr_quality   summariseTbrQuality() over the last 24 h —
//                             runs, groundedShare median, costUsd median,
//                             degradedShare (runs with ≥ 1 degraded chapter ÷
//                             runs) and a one-word verdict: `ok` | `watch`
//                             (median grounded < 0.85 or degradedShare > 0.2)
//                             | `missing` (no run in the window).
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

export const TBR_QUALITY_FILE = "tbr-quality.jsonl";
export const TBR_QUALITY_PATH = path.join("content", "reports", TBR_QUALITY_FILE);

/** §5 KPI: groundedShare median ≥ 0.85 over the window. */
export const TBR_QUALITY_GROUNDED_WATCH = 0.85;
/** More than one run in five with a degraded chapter → `watch`. */
export const TBR_QUALITY_DEGRADED_WATCH = 0.2;
export const TBR_QUALITY_WINDOW_MS = 24 * 60 * 60 * 1000;
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
}

export interface TbrQualityWindow {
  runs: number;
  groundedShareMedian: number | null;
  costUsdMedian: number | null;
  /** Runs with ≥ 1 degraded chapter ÷ runs; null when there were no runs. */
  degradedShare: number | null;
}

export type TbrQualityVerdict = "ok" | "watch" | "missing";

export interface TbrQualityStatus {
  last24h: TbrQualityWindow;
  status: TbrQualityVerdict;
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
  sviVersion: string;
  pipelineVersion?: string;
  now?: Date;
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
    degradedSections: report ? report.quality.degradedSections.length : 0,
    consistencyIssues: typeof input.consistencyIssues === "number" ? Math.floor(nonNeg(input.consistencyIssues)) : report ? report.quality.consistencyIssues.length : 0,
    pendingDims,
    words: typeof input.words === "number" ? Math.floor(nonNeg(input.words)) : est ? est.words : 0,
    pages: est ? Math.round(est.pages * 10) / 10 : 0,
    durationMs: Math.floor(nonNeg(input.durationMs)),
    sviVersion: input.sviVersion,
    pipelineVersion: input.pipelineVersion ?? report?.pipelineVersion ?? "",
  };
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

/** One human-readable line for logs / the self-report script. */
export function formatTbrQualityLine(row: TbrQualityRow): string {
  return `[tbr-quality] tier=${row.tier} calls=${row.calls} cost_usd=${row.costUsd.toFixed(4)} grounded=${row.groundedShare.toFixed(2)} degraded=${row.degradedSections} consistency=${row.consistencyIssues} pending_dims=${row.pendingDims} words=${row.words} pages=${row.pages} ms=${row.durationMs} snapshot=${row.snapshotId ?? "-"}`;
}

type RowLike = Partial<Record<keyof TbrQualityRow, unknown>>;

/** Pure reducer over jsonl rows — exported for tests. */
export function summariseTbrQuality(rows: RowLike[], now: number = Date.now(), windowMs: number = TBR_QUALITY_WINDOW_MS): TbrQualityStatus {
  const grounded: number[] = [];
  const cost: number[] = [];
  let runs = 0;
  let degradedRuns = 0;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    if (!withinLast(row.ts, windowMs, now)) continue;
    runs += 1;
    if (typeof row.groundedShare === "number" && Number.isFinite(row.groundedShare)) grounded.push(row.groundedShare);
    if (typeof row.costUsd === "number" && Number.isFinite(row.costUsd)) cost.push(row.costUsd);
    if (typeof row.degradedSections === "number" && row.degradedSections > 0) degradedRuns += 1;
  }
  if (runs === 0) return { last24h: { runs: 0, groundedShareMedian: null, costUsdMedian: null, degradedShare: null }, status: "missing" };
  const groundedMed = median(grounded);
  const costMed = median(cost);
  const degradedShare = Math.round((degradedRuns / runs) * 100) / 100;
  const watch = (groundedMed !== null && groundedMed < TBR_QUALITY_GROUNDED_WATCH) || degradedShare > TBR_QUALITY_DEGRADED_WATCH;
  return {
    last24h: {
      runs,
      groundedShareMedian: groundedMed === null ? null : Math.round(groundedMed * 100) / 100,
      costUsdMedian: costMed === null ? null : r4(costMed),
      degradedShare,
    },
    status: watch ? "watch" : "ok",
  };
}

/** The /api/status section. Never throws; names no path or project. */
export async function readTbrQualityStatus(root: string = getStatusRoot(), now: number = Date.now()): Promise<TbrQualityStatus> {
  try {
    const rows = await readJsonlTail<RowLike>(root, TBR_QUALITY_FILE, TBR_QUALITY_TAIL_LINES);
    return summariseTbrQuality(rows, now);
  } catch {
    return { last24h: { runs: 0, groundedShareMedian: null, costUsdMedian: null, degradedShare: null }, status: "missing" };
  }
}
