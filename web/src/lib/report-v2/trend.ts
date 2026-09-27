// trend — G34 F02/S3: the page-1 scorecard trend (dashboard-v4 `trend`) from
// the PREVIOUS immutable revision of the same subject (project), and only
// when both documents were scored with the same method (SV2 `methodMeta`).
//
// Rules (deterministic, pure, client-safe):
//   * baseline omitted (`undefined`) → the surface did not load history
//     ("not_loaded"); every row's trend is null.
//   * baseline `null` → loaded, no earlier revision ("first_revision").
//   * either document has no `methodMeta` (written before SV2) → the method
//     cannot be proven equal ("method_unknown") → no delta.
//   * `svi_method`, `rubric_version` or `profile_sha256` differ
//     ("method_changed") → no delta — a score moved by a method change is
//     never shown as business progress (SOT I48). `knowledge_cutoff` and the
//     contribution ledger are per-run facts, not the method, and are ignored.
//   * same method → delta = round(current − previous) per dimension, only
//     where BOTH revisions assessed that dimension (a pending chapter is not
//     a 0, so no delta is invented from or to "pending").
//
// The baseline is a compact projection of the previous revision (scores +
// method), so a server page can hand it to the client without shipping a
// second full document.

import type { DimKey } from "@/lib/report-pipeline/dimension-owners";
import { isAssessed } from "./investment-view";
import type { ReportMethodMeta, ReportV2 } from "./schema";

export type TrendMethod = Pick<ReportMethodMeta, "svi_method" | "rubric_version" | "profile_sha256">;

export interface TrendBaseline {
  revisionId: string;
  /** ISO time the previous revision was committed. */
  createdAt: string;
  /** Null = the previous document predates SV2. */
  method: TrendMethod | null;
  /** Assessed dimension scores of the previous revision (null = pending there). */
  scores: Partial<Record<DimKey, number | null>>;
}

export type TrendUnavailableReason = "not_loaded" | "first_revision" | "method_unknown" | "method_changed";

export type TrendStatus =
  | { state: "compared"; revisionId: string; since: string }
  | { state: "unavailable"; reason: TrendUnavailableReason };

export interface DimensionTrends {
  status: TrendStatus;
  /** Only dimensions assessed in both revisions under the same method. */
  deltas: Partial<Record<DimKey, number>>;
}

/** The method part of a document's SV2 stamp, or null when unstamped. */
export function trendMethodOf(report: Pick<ReportV2, "methodMeta">): TrendMethod | null {
  const m = report.methodMeta;
  if (!m || !m.svi_method || !m.rubric_version || !m.profile_sha256) return null;
  return { svi_method: m.svi_method, rubric_version: m.rubric_version, profile_sha256: m.profile_sha256 };
}

/** Same scoring method = same SVI method, rubric version and profile hash. */
export function sameTrendMethod(a: TrendMethod | null, b: TrendMethod | null): boolean {
  return a !== null && b !== null && a.svi_method === b.svi_method && a.rubric_version === b.rubric_version && a.profile_sha256 === b.profile_sha256;
}

/** Assessed score per dimension (null = pending / unassessed / non-finite). */
export function assessedScores(report: Pick<ReportV2, "dimensions">): Partial<Record<DimKey, number | null>> {
  const out: Partial<Record<DimKey, number | null>> = {};
  for (const ch of report.dimensions) {
    out[ch.dim] = isAssessed(ch) && ch.band !== "pending" && Number.isFinite(ch.score) ? ch.score : null;
  }
  return out;
}

/** Compact baseline from a stored revision document. */
export function trendBaselineFrom(report: Pick<ReportV2, "dimensions" | "methodMeta">, revisionId: string, createdAt: string): TrendBaseline {
  return { revisionId, createdAt, method: trendMethodOf(report), scores: assessedScores(report) };
}

/** Per-dimension deltas vs the previous same-method revision. See the header for the rules. */
export function computeDimensionTrends(current: Pick<ReportV2, "dimensions" | "methodMeta">, baseline: TrendBaseline | null | undefined): DimensionTrends {
  if (baseline === undefined) return { status: { state: "unavailable", reason: "not_loaded" }, deltas: {} };
  if (baseline === null) return { status: { state: "unavailable", reason: "first_revision" }, deltas: {} };
  const now = trendMethodOf(current);
  if (now === null || baseline.method === null) return { status: { state: "unavailable", reason: "method_unknown" }, deltas: {} };
  if (!sameTrendMethod(now, baseline.method)) return { status: { state: "unavailable", reason: "method_changed" }, deltas: {} };
  const cur = assessedScores(current);
  const deltas: Partial<Record<DimKey, number>> = {};
  for (const dim of Object.keys(cur) as DimKey[]) {
    const a = cur[dim];
    const b = baseline.scores[dim];
    if (typeof a === "number" && typeof b === "number" && Number.isFinite(b)) deltas[dim] = Math.round(a - b);
  }
  return { status: { state: "compared", revisionId: baseline.revisionId, since: baseline.createdAt }, deltas };
}

/** "+4" / "−3" / "±0" (U+2212 minus, the investment-view convention). */
export function signedDelta(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0";
}

/** dd/mm/yyyy in UTC — deterministic across server and client time zones. */
export function trendDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}
