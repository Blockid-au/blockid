// Benchmark segments — the pure half of G21 P3-B (score-governance § 7).
//
// A segment is a comparison set: every company at a stage (`stage:4`), or
// every company at a stage in a sector (`stage:4|sector:saas`). The nightly
// cron (`/api/cron/benchmark-segments`) feeds `computeSegments()` ONE latest
// score per company (never one per analysis row — `latestScorePerProject`
// in lib/svi/assessment-context.ts) and stores every segment, including the
// ones under the publication floor; the DB hides those from clients (RLS
// `n >= 10`) and `selectSegment()` never returns one either.
//
//   segmentKey(stage, sector?)        "stage:4" · "stage:4|sector:saas"
//   normaliseSector(raw)              "SaaS / Software" → "saas"; null when empty
//   computeSegments(rows)             stage + stage × sector rows with n, median,
//                                     p25, p75 and the P1-C band
//   selectSegment(rows, stage, sector) the published sector segment, else the
//                                     published stage segment (label says so),
//                                     else null
//
// Pure, dependency-free apart from publication-rules and the sector
// catalogue; the DB reader is ./segments-db.ts.

import { benchmarkBand, benchmarkLabel, publishBenchmark, type BenchmarkBand, type PublishedBenchmark } from "./publication-rules";
import { SECTOR_LABELS } from "@/lib/svi-analysis";

export interface SegmentScoreRow {
  /** Project id — one row per company (the caller dedupes). */
  projectId: string;
  stage: number;
  /** Raw sector string from the analysis (`analysis_json->>sector`) — normalised here. */
  sector: string | null;
  svi: number;
}

export interface BenchmarkSegment {
  segmentKey: string;
  stage: number;
  sector: string | null;
  n: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  band: BenchmarkBand;
  computedAt: string;
}

/** A segment that may be shown, plus the label the surface prints. */
export interface SelectedSegment extends PublishedBenchmark {
  segmentKey: string;
  stage: number;
  sector: string | null;
  /** True when the caller asked for a sector and only the stage segment was published. */
  fellBackToStage: boolean;
  /** "Stage 4 · SaaS" · "Stage 4 (SaaS segment not published yet — n = 6)". */
  label: string;
  computedAt: string;
}

export const SEGMENT_KEY_RE = /^stage:(\d{1,2})(?:\|sector:([a-z0-9]{1,40}))?$/;

const MAX_SECTOR_KEY = 40;

/** Canonical sector key from a free-text industry / sector string; null when unknown or empty. */
export function normaliseSector(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed === "default" || trimmed === "unclassified" || trimmed === "other" || trimmed === "unknown") return null;
  const compact = trimmed.replace(/[^a-z0-9]/g, "");
  if (compact in SECTOR_LABELS) return compact;
  // "SaaS / Software" (a SECTOR_LABELS value) → its key; "software" alone → saas.
  for (const [key, label] of Object.entries(SECTOR_LABELS)) {
    const parts = label.toLowerCase().split("/").map((p) => p.replace(/[^a-z0-9]/g, ""));
    if (parts.includes(compact)) return key;
  }
  for (const key of Object.keys(SECTOR_LABELS)) if (compact.includes(key)) return key;
  if (!compact) return null;
  return compact.slice(0, MAX_SECTOR_KEY);
}

/** Human label for a sector key ("saas" → "SaaS / Software"; unknown keys are echoed). */
export function sectorLabel(sector: string | null | undefined): string | null {
  if (!sector) return null;
  return SECTOR_LABELS[sector] ?? sector;
}

export function segmentKey(stage: number, sector?: string | null): string {
  const s = Math.max(0, Math.min(12, Math.floor(Number.isFinite(stage) ? stage : 0)));
  const sec = normaliseSector(sector);
  return sec ? `stage:${s}|sector:${sec}` : `stage:${s}`;
}

export function parseSegmentKey(key: string): { stage: number; sector: string | null } | null {
  const m = SEGMENT_KEY_RE.exec(key);
  if (!m) return null;
  return { stage: Number(m[1]), sector: m[2] ?? null };
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0]!;
  const pos = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const w = pos - lo;
  return sorted[lo]! * (1 - w) + sorted[hi]! * w;
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

function statsOf(values: number[]): { n: number; median: number | null; p25: number | null; p75: number | null } {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return { n: 0, median: null, p25: null, p75: null };
  return { n: sorted.length, median: round1(percentile(sorted, 50)), p25: round1(percentile(sorted, 25)), p75: round1(percentile(sorted, 75)) };
}

/**
 * Every stage segment and every stage × sector segment present in `rows`
 * (one row per company). Segments under the floor are returned too, with
 * band "none" — the store keeps them, clients never see them.
 */
export function computeSegments(rows: readonly SegmentScoreRow[], computedAt: string = new Date().toISOString()): BenchmarkSegment[] {
  const byStage = new Map<number, number[]>();
  const bySector = new Map<string, { stage: number; sector: string; values: number[] }>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.projectId || seen.has(row.projectId)) continue;
    if (!Number.isFinite(row.stage) || !Number.isFinite(row.svi)) continue;
    seen.add(row.projectId);
    const stage = Math.floor(row.stage);
    if (stage < 0 || stage > 12) continue;
    (byStage.get(stage) ?? byStage.set(stage, []).get(stage)!).push(row.svi);
    const sector = normaliseSector(row.sector);
    if (!sector) continue;
    const key = segmentKey(stage, sector);
    (bySector.get(key) ?? bySector.set(key, { stage, sector, values: [] }).get(key)!).values.push(row.svi);
  }
  const out: BenchmarkSegment[] = [];
  for (const [stage, values] of byStage) {
    const s = statsOf(values);
    out.push({ segmentKey: segmentKey(stage), stage, sector: null, ...s, band: benchmarkBand(s.n), computedAt });
  }
  for (const [key, { stage, sector, values }] of bySector) {
    const s = statsOf(values);
    out.push({ segmentKey: key, stage, sector, ...s, band: benchmarkBand(s.n), computedAt });
  }
  return out.sort((a, b) => a.stage - b.stage || (a.sector ?? "").localeCompare(b.sector ?? ""));
}

/** True when the segment may be shown (P1-C floor). */
export function isPublished(seg: Pick<BenchmarkSegment, "n" | "median">): boolean {
  return benchmarkBand(seg.n) !== "none" && seg.median != null && Number.isFinite(seg.median);
}

function publish(seg: BenchmarkSegment, segmentText: string): PublishedBenchmark | null {
  if (seg.median == null) return null;
  return publishBenchmark({ median: seg.median, p25: seg.p25, p75: seg.p75, n: seg.n, segment: segmentText });
}

/** "Stage 4 · SaaS" / "Stage 4". */
export function segmentTitle(stage: number, sector: string | null): string {
  const sec = sectorLabel(sector);
  return sec ? `Stage ${stage} · ${sec}` : `Stage ${stage}`;
}

/**
 * The segment a surface should print for (stage, sector): the published
 * sector segment when it exists, else the published stage-only segment
 * (with `fellBackToStage` and a label that says so), else null — the
 * surface then prints `notEnoughLine(n)`.
 */
export function selectSegment(rows: readonly BenchmarkSegment[], stage: number, sector?: string | null): SelectedSegment | null {
  const sec = normaliseSector(sector);
  const wantKey = segmentKey(stage, sec);
  const stageKey = segmentKey(stage);
  const sectorSeg = sec ? rows.find((r) => r.segmentKey === wantKey) ?? null : null;
  const stageSeg = rows.find((r) => r.segmentKey === stageKey) ?? null;

  if (sectorSeg && isPublished(sectorSeg)) {
    const p = publish(sectorSeg, segmentTitle(stage, sec));
    if (p) return { ...p, segmentKey: sectorSeg.segmentKey, stage, sector: sec, fellBackToStage: false, label: `${segmentTitle(stage, sec)} — ${benchmarkLabel(p.n)}`, computedAt: sectorSeg.computedAt };
  }
  if (stageSeg && isPublished(stageSeg)) {
    const p = publish(stageSeg, segmentTitle(stage, null));
    if (!p) return null;
    const fallbackNote = sec ? ` (${sectorLabel(sec)} segment not published yet — n = ${sectorSeg?.n ?? 0})` : "";
    return { ...p, segmentKey: stageSeg.segmentKey, stage, sector: null, fellBackToStage: !!sec, label: `${segmentTitle(stage, null)} — ${benchmarkLabel(p.n)}${fallbackNote}`, computedAt: stageSeg.computedAt };
  }
  return null;
}

/** The n the "not enough" line should quote for (stage, sector): the sector segment's n when it exists, else the stage's. */
export function segmentSampleSize(rows: readonly BenchmarkSegment[], stage: number, sector?: string | null): number {
  const sec = normaliseSector(sector);
  const hit = (sec ? rows.find((r) => r.segmentKey === segmentKey(stage, sec)) : null) ?? rows.find((r) => r.segmentKey === segmentKey(stage));
  return hit?.n ?? 0;
}

/** The public projection of a published segment (institutional API, content JSON). */
export interface PublishedSegmentRow {
  segment_key: string;
  stage: number;
  sector: string | null;
  sector_label: string | null;
  n: number;
  median: number;
  p25: number | null;
  p75: number | null;
  band: Exclude<BenchmarkBand, "none">;
  label: string;
  computed_at: string;
}

/** Published rows only, as the API / JSON file prints them — never an n < 10 row. */
export function toPublishedRows(rows: readonly BenchmarkSegment[]): PublishedSegmentRow[] {
  const out: PublishedSegmentRow[] = [];
  for (const r of rows) {
    if (!isPublished(r)) continue;
    const p = publish(r, segmentTitle(r.stage, r.sector));
    if (!p) continue;
    out.push({ segment_key: r.segmentKey, stage: r.stage, sector: r.sector, sector_label: sectorLabel(r.sector), n: p.n, median: p.median, p25: p.p25, p75: p.p75, band: p.band, label: p.label, computed_at: r.computedAt });
  }
  return out;
}
