// cohort-rows — the BlockID Cohort row model (G21 P2-B; FI § 53/54).
//
// PURE and client-safe: no Supabase, no "server-only". The table, the
// filters, the compare drawer and the CSV all read from here. The loader
// that assembles the inputs from the DB is ./cohort-rows-loader.ts.
//
//   buildCohortRows(items, analyses, assessments, overrides, weights, deltas)
//     items        the batch's rows as ./batch.ts already builds them
//                  (+ the 0423 item columns) — one per evaluation_batch_items
//     analyses     per project: evidence confidence, verification level,
//                  pending dims, unverified material claims (from the
//                  snapshot's analysis_json through the Assessment Card
//                  builders) — missing → nulls, never a fabricated number
//     assessments  per evaluation: the VIEWING seat's latest decision
//     overrides    every assessment_overrides row of the batch
//     weights      the program rubric (rubric_weights) → "Program score"
//     deltas       P2-A's `deltaByProject(batchId)` result when available;
//                  a project absent here falls back to the item's own
//                  "Δ since last" (svi_snapshots baseline in batch.ts)
//
//   filterCohortRows / sortCohortRows — pure; the URL ↔ filter codec lives
//   here too so CohortFilters and the page agree on `?stage=&sector=…`.
//
// Custom weights are REAL for the ranking: `weightedScore` (the program
// rubric over the 8 stored dimension scores) is the default sort. The SVI
// itself is never altered and is always shown beside it, labelled.
//
// Human overrides never replace the model: `weightedScore` is the model
// number; `overrideWeightedScore` is the same rubric with the latest human
// override per dimension applied (null when there is none) — the table
// shows both.

import {
  DIMENSION_KEYS,
  DIMENSION_LABELS,
  csvCell,
  CSV_BOM,
  stageName,
  weightedScore,
  type BatchStatus,
  type CohortDecision,
  type CohortRow as BatchCohortRow,
  type CohortRowDecision,
  type DimensionKey,
  type RubricWeights,
} from "./batch-shared";
import { applyOverrides, latestOverrideByDimension, type OverrideRow } from "./overrides-shared";

// ─── Types ──────────────────────────────────────────────────────────────────

export const REVIEW_STATUSES = ["unreviewed", "in_review", "reviewed"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = { unreviewed: "Unreviewed", in_review: "In review", reviewed: "Reviewed" };

/** A batch row as ./batch.ts builds it, plus the 0423 item columns. */
export interface CohortItemInput extends BatchCohortRow {
  snapshotId: string | null;
  shortlisted: boolean;
  reviewStatus: ReviewStatus;
  reviewerId: string | null;
  reviewerName: string | null;
}

/** What the snapshot's analysis tells us per project (all fail-soft). */
export interface CohortAnalysisInput {
  /** Evidence Confidence 0–100 (snapshot column or recomputed from analysis_json). */
  evidenceConfidence: number | null;
  /** projects.verification_level 0–5. */
  verificationLevel: number | null;
  /** Dimensions still pending (0–8). */
  pendingDims: number | null;
  /** Claims in claimed / unverified / conflicting. */
  unverifiedMaterialClaims: number | null;
  /** Claims in `conflicting` specifically (risk flag). */
  conflictingClaims: number | null;
}

export type RiskFlag = "low_dimension" | "conflicting_claims" | "unverified_claims" | "scoring_failed";

export interface DecisionLogEntry {
  kind: "assessment" | "override";
  at: string;
  actorId: string | null;
  actorName: string | null;
  /** assessment: "v2 · proceed · conviction 4 · submitted" / override: "Traction 48 → 62 · sector context". */
  summary: string;
  decision?: CohortDecision | null;
  conviction?: number | null;
  status?: "draft" | "submitted";
  version?: number;
  reasonCode?: string;
  note?: string | null;
}

export interface CohortRow {
  itemId: number;
  projectId: string;
  evaluationId: string;
  company: string;
  stage: number | null;
  stageLabel: string;
  sector: string | null;
  /** Canonical SVI (never altered). */
  svi: number | null;
  /** Evidence Confidence 0–100 or null. */
  confidence: number | null;
  /** "L2" (BlockID Verified level short label). */
  verification: string;
  verificationLevel: number;
  /** Δ SVI since the last snapshot (P2-A) or the item's own baseline; null = first score. */
  delta: number | null;
  strongestDim: DimensionKey | null;
  weakestDim: DimensionKey | null;
  strongestLabel: string | null;
  weakestLabel: string | null;
  /** Evidence gaps = pending dimensions + unverified material claims. */
  gapsCount: number;
  reviewStatus: ReviewStatus;
  reviewer: { id: string; name: string | null } | null;
  decision: CohortDecision | null;
  conviction: number | null;
  assessmentStatus: "draft" | "submitted" | null;
  shortlisted: boolean;
  /** Program score: rubric_weights over the model dimension scores. */
  weightedScore: number | null;
  /** Program score with the latest human override per dimension applied; null when no dimension override. */
  overrideWeightedScore: number | null;
  dimensionScores: Partial<Record<DimensionKey, number>> | null;
  /** Latest human override per dimension (and `total`). */
  overriddenDimensions: Partial<Record<DimensionKey | "total", { from: number | null; to: number; reasonCode: string }>>;
  overrides: OverrideRow[];
  overridesCount: number;
  riskFlags: RiskFlag[];
  status: BatchStatus;
  reportUrl: string | null;
  pdfUrl: string | null;
  dossierUrl: string;
  error: string | null;
  scoredAt: string | null;
  log: DecisionLogEntry[];
}

// ─── Build ──────────────────────────────────────────────────────────────────

const LOW_DIMENSION = 40;

function finite(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function extremes(scores: Partial<Record<DimensionKey, number>> | null): { strongest: DimensionKey | null; weakest: DimensionKey | null } {
  if (!scores) return { strongest: null, weakest: null };
  let strongest: DimensionKey | null = null;
  let weakest: DimensionKey | null = null;
  for (const k of DIMENSION_KEYS) {
    const s = finite(scores[k]);
    if (s == null) continue;
    if (strongest == null || s > (scores[strongest] as number)) strongest = k;
    if (weakest == null || s < (scores[weakest] as number)) weakest = k;
  }
  return { strongest, weakest };
}

const VERIFICATION_SHORT: Record<number, string> = { 0: "L0", 1: "L1", 2: "L2", 3: "L3", 4: "L4", 5: "L5" };

export function verificationShort(level: number | null | undefined): { level: number; short: string } {
  const n = Math.max(0, Math.min(5, Math.round(finite(level) ?? 0)));
  return { level: n, short: VERIFICATION_SHORT[n] ?? "L0" };
}

/** Pure: which risk flags a row carries (any dimension < 40 · conflicting claims · scoring failed). */
export function riskFlagsFor(input: { dimensionScores: Partial<Record<DimensionKey, number>> | null; conflictingClaims: number | null; unverifiedMaterialClaims: number | null; status: BatchStatus }): RiskFlag[] {
  const flags: RiskFlag[] = [];
  if (input.dimensionScores && DIMENSION_KEYS.some((k) => (finite(input.dimensionScores?.[k]) ?? 100) < LOW_DIMENSION)) flags.push("low_dimension");
  if ((input.conflictingClaims ?? 0) > 0) flags.push("conflicting_claims");
  if ((input.unverifiedMaterialClaims ?? 0) > 0) flags.push("unverified_claims");
  if (input.status === "failed") flags.push("scoring_failed");
  return flags;
}

export const RISK_FLAG_LABELS: Record<RiskFlag, string> = {
  low_dimension: "A dimension below 40",
  conflicting_claims: "Conflicting claims",
  unverified_claims: "Unverified material claims",
  scoring_failed: "Scoring failed",
};

export interface AssessmentLogInput {
  evaluationId: string;
  version: number;
  status: "draft" | "submitted";
  decision: CohortDecision | null;
  conviction: number | null;
  assessorId: string | null;
  assessorName: string | null;
  updatedAt: string;
}

function overrideSummary(o: OverrideRow): string {
  const label = o.dimension === "total" ? "SVI total" : DIMENSION_LABELS[o.dimension as DimensionKey];
  const from = o.fromValue == null ? "—" : String(Math.round(o.fromValue));
  return `${label} ${from} → ${Math.round(o.toValue)} · ${o.reasonCode.replace(/_/g, " ")}`;
}

/** Pure: the per-row decision log (assessment versions + overrides), newest first. */
export function buildDecisionLog(assessments: ReadonlyArray<AssessmentLogInput>, overrides: ReadonlyArray<OverrideRow>): DecisionLogEntry[] {
  const entries: DecisionLogEntry[] = [];
  for (const a of assessments) {
    const bits = [`v${a.version}`, a.decision ?? "no decision", a.conviction == null ? null : `conviction ${a.conviction}`, a.status].filter(Boolean);
    entries.push({ kind: "assessment", at: a.updatedAt, actorId: a.assessorId, actorName: a.assessorName, summary: bits.join(" · "), decision: a.decision, conviction: a.conviction, status: a.status, version: a.version });
  }
  for (const o of overrides) {
    entries.push({ kind: "override", at: o.createdAt, actorId: o.reviewerId, actorName: o.reviewerName, summary: overrideSummary(o), reasonCode: o.reasonCode, note: o.note });
  }
  return entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export function buildCohortRows(
  items: ReadonlyArray<CohortItemInput>,
  analyses: Readonly<Record<string, CohortAnalysisInput | undefined>>,
  assessments: Readonly<Record<string, CohortRowDecision | undefined>>,
  overrides: ReadonlyArray<OverrideRow>,
  weights: RubricWeights,
  deltas: Readonly<Record<string, number | null | undefined>> = {},
  assessmentLog: ReadonlyArray<AssessmentLogInput> = [],
): CohortRow[] {
  const overridesByItem = new Map<number, OverrideRow[]>();
  for (const o of overrides) {
    const list = overridesByItem.get(o.itemId) ?? [];
    list.push(o);
    overridesByItem.set(o.itemId, list);
  }
  const logByEvaluation = new Map<string, AssessmentLogInput[]>();
  for (const a of assessmentLog) {
    const list = logByEvaluation.get(a.evaluationId) ?? [];
    list.push(a);
    logByEvaluation.set(a.evaluationId, list);
  }
  return items.map((item) => {
    const analysis = analyses[item.projectId];
    const seat = assessments[item.evaluationId];
    const own = overridesByItem.get(item.itemId) ?? [];
    const latest = latestOverrideByDimension(own);
    const overridden: CohortRow["overriddenDimensions"] = {};
    for (const [dim, o] of Object.entries(latest)) if (o) overridden[dim as DimensionKey | "total"] = { from: o.fromValue, to: o.toValue, reasonCode: o.reasonCode };
    const withOverrides = applyOverrides(item.dimensionScores, own);
    const hasDimOverride = DIMENSION_KEYS.some((k) => !!latest[k]);
    const { strongest, weakest } = extremes(item.dimensionScores);
    const ver = verificationShort(analysis?.verificationLevel);
    const delta = Object.prototype.hasOwnProperty.call(deltas, item.projectId) && deltas[item.projectId] !== undefined ? deltas[item.projectId]! : item.delta;
    const gaps = (analysis?.pendingDims ?? 0) + (analysis?.unverifiedMaterialClaims ?? 0);
    return {
      itemId: item.itemId,
      projectId: item.projectId,
      evaluationId: item.evaluationId,
      company: item.startup,
      stage: item.stage,
      stageLabel: stageName(item.stage),
      sector: item.industry,
      svi: item.svi,
      confidence: analysis?.evidenceConfidence == null ? null : Math.round(analysis.evidenceConfidence),
      verification: ver.short,
      verificationLevel: ver.level,
      delta,
      strongestDim: strongest,
      weakestDim: weakest,
      strongestLabel: strongest ? DIMENSION_LABELS[strongest] : null,
      weakestLabel: weakest ? DIMENSION_LABELS[weakest] : null,
      gapsCount: gaps,
      reviewStatus: item.reviewStatus,
      reviewer: item.reviewerId ? { id: item.reviewerId, name: item.reviewerName } : null,
      decision: seat?.decision ?? null,
      conviction: seat?.conviction ?? null,
      assessmentStatus: seat?.assessmentStatus ?? null,
      shortlisted: item.shortlisted,
      weightedScore: weightedScore(item.dimensionScores, weights),
      overrideWeightedScore: hasDimOverride ? weightedScore(withOverrides, weights) : null,
      dimensionScores: item.dimensionScores,
      overriddenDimensions: overridden,
      overrides: own,
      overridesCount: own.length,
      riskFlags: riskFlagsFor({ dimensionScores: item.dimensionScores, conflictingClaims: analysis?.conflictingClaims ?? null, unverifiedMaterialClaims: analysis?.unverifiedMaterialClaims ?? null, status: item.status }),
      status: item.status,
      reportUrl: item.reportUrl,
      pdfUrl: item.pdfUrl,
      dossierUrl: `/workspace/evaluations/${encodeURIComponent(item.evaluationId)}`,
      error: item.error,
      scoredAt: item.scoredAt,
      log: buildDecisionLog(logByEvaluation.get(item.evaluationId) ?? [], own),
    };
  });
}

// ─── Filters ────────────────────────────────────────────────────────────────

export type Range = [number, number];

export interface CohortFilters {
  stage?: number[];
  sector?: string[];
  /** Canonical SVI range 0–100. */
  svi?: Range;
  /** Evidence Confidence range 0–100. */
  conf?: Range;
  /** Traction & Revenue dimension range 0–100. */
  traction?: Range;
  /** Only rows with ≥ 1 risk flag. */
  risk?: boolean;
  /** Minimum BlockID Verified level 0–5. */
  ver?: number;
  status?: ReviewStatus[];
  /** "none" = no decision yet. */
  decision?: Array<CohortDecision | "none">;
  shortlist?: boolean;
  /** Free-text on company / sector. */
  q?: string;
}

export const EMPTY_FILTERS: Readonly<CohortFilters> = Object.freeze({});

function inRange(v: number | null | undefined, r: Range | undefined): boolean {
  if (!r) return true;
  if (v == null) return false;
  return v >= r[0] && v <= r[1];
}

export function filterCohortRows(rows: ReadonlyArray<CohortRow>, filters: CohortFilters): CohortRow[] {
  const q = filters.q?.trim().toLowerCase();
  const sectors = filters.sector?.map((s) => s.toLowerCase());
  return rows.filter((r) => {
    if (filters.stage?.length && (r.stage == null || !filters.stage.includes(r.stage))) return false;
    if (sectors?.length && (!r.sector || !sectors.includes(r.sector.toLowerCase()))) return false;
    if (!inRange(r.svi, filters.svi)) return false;
    if (!inRange(r.confidence, filters.conf)) return false;
    if (filters.traction && !inRange(finite(r.dimensionScores?.tre), filters.traction)) return false;
    if (filters.risk && r.riskFlags.length === 0) return false;
    if (filters.ver != null && r.verificationLevel < filters.ver) return false;
    if (filters.status?.length && !filters.status.includes(r.reviewStatus)) return false;
    if (filters.decision?.length && !filters.decision.includes(r.decision ?? "none")) return false;
    if (filters.shortlist && !r.shortlisted) return false;
    if (q && !`${r.company} ${r.sector ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Pure: how many filters are active (for the "Clear (n)" chip). */
export function activeFilterCount(f: CohortFilters): number {
  let n = 0;
  if (f.stage?.length) n++;
  if (f.sector?.length) n++;
  if (f.svi) n++;
  if (f.conf) n++;
  if (f.traction) n++;
  if (f.risk) n++;
  if (f.ver != null) n++;
  if (f.status?.length) n++;
  if (f.decision?.length) n++;
  if (f.shortlist) n++;
  if (f.q?.trim()) n++;
  return n;
}

// ─── URL codec (`?stage=3,4&sector=SaaS&svi=40-80&conf=50-100&traction=30-100&risk=1&ver=2&status=in_review&decision=proceed,none&shortlist=1&q=acme`) ──

function parseRange(v: string | null): Range | undefined {
  if (!v) return undefined;
  const m = /^(\d{1,3})-(\d{1,3})$/.exec(v.trim());
  if (!m) return undefined;
  const lo = Math.max(0, Math.min(100, Number(m[1])));
  const hi = Math.max(0, Math.min(100, Number(m[2])));
  return lo <= hi ? [lo, hi] : [hi, lo];
}

function parseList(v: string | null): string[] {
  return (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

type ParamsLike = { get(name: string): string | null };

function toParams(input: ParamsLike | Record<string, string | string[] | undefined> | string): ParamsLike {
  if (typeof input === "string") return new URLSearchParams(input.startsWith("?") ? input.slice(1) : input);
  if (typeof (input as ParamsLike).get === "function") return input as ParamsLike;
  const rec = input as Record<string, string | string[] | undefined>;
  return { get: (k) => (Array.isArray(rec[k]) ? (rec[k] as string[])[0] ?? null : (rec[k] as string | undefined) ?? null) };
}

export function parseCohortFilters(input: ParamsLike | Record<string, string | string[] | undefined> | string): CohortFilters {
  const p = toParams(input);
  const out: CohortFilters = {};
  const stage = parseList(p.get("stage")).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 7);
  if (stage.length) out.stage = [...new Set(stage)];
  const sector = parseList(p.get("sector")).slice(0, 20);
  if (sector.length) out.sector = sector;
  const svi = parseRange(p.get("svi"));
  if (svi) out.svi = svi;
  const conf = parseRange(p.get("conf"));
  if (conf) out.conf = conf;
  const traction = parseRange(p.get("traction"));
  if (traction) out.traction = traction;
  if (p.get("risk") === "1") out.risk = true;
  const ver = Number(p.get("ver"));
  if (p.get("ver") != null && Number.isInteger(ver) && ver >= 0 && ver <= 5) out.ver = ver;
  const status = parseList(p.get("status")).filter((s): s is ReviewStatus => (REVIEW_STATUSES as readonly string[]).includes(s));
  if (status.length) out.status = [...new Set(status)];
  const decision = parseList(p.get("decision")).filter((s): s is CohortDecision | "none" => s === "none" || s === "pass" || s === "track" || s === "proceed");
  if (decision.length) out.decision = [...new Set(decision)];
  if (p.get("shortlist") === "1") out.shortlist = true;
  const q = (p.get("q") ?? "").trim().slice(0, 80);
  if (q) out.q = q;
  return out;
}

export function cohortFiltersToParams(f: CohortFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.stage?.length) p.set("stage", f.stage.join(","));
  if (f.sector?.length) p.set("sector", f.sector.join(","));
  if (f.svi) p.set("svi", `${f.svi[0]}-${f.svi[1]}`);
  if (f.conf) p.set("conf", `${f.conf[0]}-${f.conf[1]}`);
  if (f.traction) p.set("traction", `${f.traction[0]}-${f.traction[1]}`);
  if (f.risk) p.set("risk", "1");
  if (f.ver != null) p.set("ver", String(f.ver));
  if (f.status?.length) p.set("status", f.status.join(","));
  if (f.decision?.length) p.set("decision", f.decision.join(","));
  if (f.shortlist) p.set("shortlist", "1");
  if (f.q?.trim()) p.set("q", f.q.trim());
  return p;
}

// ─── Sort ───────────────────────────────────────────────────────────────────

export const COHORT_SORT_KEYS = [
  "company",
  "stage",
  "sector",
  "svi",
  "confidence",
  "verification",
  "delta",
  "strongest",
  "weakest",
  "gaps",
  "reviewStatus",
  "reviewer",
  "decision",
  "conviction",
  "shortlist",
  "weightedScore",
] as const;
export type CohortSortKey = (typeof COHORT_SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

const DECISION_RANK: Record<CohortDecision, number> = { pass: 1, track: 2, proceed: 3 };
const REVIEW_RANK: Record<ReviewStatus, number> = { unreviewed: 0, in_review: 1, reviewed: 2 };

function sortValue(r: CohortRow, key: CohortSortKey): string | number | null {
  switch (key) {
    case "company":
      return r.company;
    case "stage":
      return r.stage;
    case "sector":
      return r.sector;
    case "svi":
      return r.svi;
    case "confidence":
      return r.confidence;
    case "verification":
      return r.verificationLevel;
    case "delta":
      return r.delta;
    case "strongest":
      return r.strongestLabel;
    case "weakest":
      return r.weakestLabel;
    case "gaps":
      return r.gapsCount;
    case "reviewStatus":
      return REVIEW_RANK[r.reviewStatus];
    case "reviewer":
      return r.reviewer?.name ?? null;
    case "decision":
      return r.decision ? DECISION_RANK[r.decision] : null;
    case "conviction":
      return r.conviction;
    case "shortlist":
      return r.shortlisted ? 1 : 0;
    case "weightedScore":
      return r.weightedScore;
  }
}

/** Text columns default ascending; numbers descending. */
export function defaultSortDir(key: CohortSortKey): SortDir {
  return key === "company" || key === "sector" || key === "strongest" || key === "weakest" || key === "reviewer" ? "asc" : "desc";
}

/** Nulls (unscored / undecided) always last, whichever direction; ties fall back to company name. */
export function sortCohortRows(rows: ReadonlyArray<CohortRow>, key: CohortSortKey, dir: SortDir): CohortRow[] {
  return [...rows].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (av == null && bv == null) return a.company.localeCompare(b.company);
    if (av == null) return 1;
    if (bv == null) return -1;
    const base = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    if (base === 0) return a.company.localeCompare(b.company);
    return dir === "asc" ? base : -base;
  });
}

// ─── Header stats ───────────────────────────────────────────────────────────

export function medianOf(values: ReadonlyArray<number | null | undefined>): number | null {
  const xs = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid]! : Math.round(((xs[mid - 1]! + xs[mid]!) / 2) * 10) / 10;
}

export interface CohortHeaderStats {
  n: number;
  scored: number;
  medianSvi: number | null;
  medianConfidence: number | null;
  shortlisted: number;
  reviewed: number;
  overrides: number;
}

export function cohortHeaderStats(rows: ReadonlyArray<CohortRow>): CohortHeaderStats {
  return {
    n: rows.length,
    scored: rows.filter((r) => r.svi != null).length,
    medianSvi: medianOf(rows.map((r) => r.svi)),
    medianConfidence: medianOf(rows.map((r) => r.confidence)),
    shortlisted: rows.filter((r) => r.shortlisted).length,
    reviewed: rows.filter((r) => r.reviewStatus === "reviewed").length,
    overrides: rows.reduce((n, r) => n + r.overridesCount, 0),
  };
}

// ─── Δ adapter (P2-A hook) ──────────────────────────────────────────────────
//
// P2-A ships `lib/evaluations/cohort-delta.ts` exporting
// `deltaByProject(batchId): Promise<Record<string, number | null>>` in a
// parallel worktree. This lane must not create that file, and a static
// import of a module that does not exist yet fails tsc / the build; a
// `webpackIgnore` dynamic import is not rewritten by webpack and breaks
// the standalone server (lib/portfolio.ts lesson). So the adapter is a
// provider slot:
//
//   P2-A WIRING (merge session, one line each in ./cohort-rows-loader.ts):
//     import { deltaByProject } from "./cohort-delta";
//     registerCohortDeltaProvider(deltaByProject);
//
// Until then `getCohortDeltas` resolves `{}` and every row keeps the
// item's own "Δ since last" baseline from batch.ts.

export type CohortDeltaProvider = (batchId: string) => Promise<Record<string, number | null>>;

let deltaProvider: CohortDeltaProvider | null = null;

export function registerCohortDeltaProvider(fn: CohortDeltaProvider | null): void {
  deltaProvider = fn;
}

export async function getCohortDeltas(batchId: string): Promise<Record<string, number | null>> {
  if (!deltaProvider) return {};
  try {
    const out = await deltaProvider(batchId);
    return out && typeof out === "object" ? out : {};
  } catch {
    return {};
  }
}

// ─── CSV (extends the T0272 export with the P2-B columns) ───────────────────

export const BLOCKID_COHORT_CSV_HEADERS = [
  "Company",
  "Stage",
  "Sector",
  "SVI",
  "Program score",
  "Program score (with overrides)",
  "Evidence confidence",
  "Verification",
  "Delta since last",
  "Strongest dimension",
  "Weakest dimension",
  "Evidence gaps",
  "Risk flags",
  "Review status",
  "Reviewer",
  "Decision",
  "Conviction",
  "Assessment status",
  "Shortlisted",
  "Overrides",
  ...DIMENSION_KEYS.map((k) => DIMENSION_LABELS[k]),
  "Status",
  "Report link",
  "Scored at",
  "Error",
] as const;

export function blockIdCohortCsv(rows: ReadonlyArray<CohortRow>, base = "https://blockid.au"): string {
  const lines = [BLOCKID_COHORT_CSV_HEADERS.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.company,
        r.stage == null ? "" : r.stageLabel,
        r.sector,
        r.svi,
        r.weightedScore,
        r.overrideWeightedScore,
        r.confidence,
        r.verification,
        r.delta,
        r.strongestLabel,
        r.weakestLabel,
        r.gapsCount,
        r.riskFlags.join("; "),
        r.reviewStatus,
        r.reviewer?.name ?? r.reviewer?.id ?? "",
        r.decision ?? "",
        r.conviction,
        r.assessmentStatus ?? "",
        r.shortlisted ? "yes" : "no",
        r.overridesCount,
        ...DIMENSION_KEYS.map((k) => r.dimensionScores?.[k] ?? ""),
        r.status,
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
