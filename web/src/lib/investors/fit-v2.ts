// FIT_WEIGHTS_V2 — the one mandate ⇄ startup scorer (G13-W3-T2, BA spec
// docs/plans/investor-clarity-2026-09-15/10-ba-investor-dossier-taxonomy.md
// §B.8). Extends `FIT_WEIGHTS` (lib/funding/investor-match.ts: sector 40 /
// stage 30 / geo 20 / svi 10 over free-text `investor_prefs`) with the
// taxonomy vocabulary and the 7-section mandate:
//
//   axis            weight  rule
//   industry          25    full if industry ∈ sectors_include (or include
//                           empty); 12 if only industry_secondary matches;
//                           0 + HARD GATE if ∈ sectors_exclude
//   business_model    15    full if ∈ business_models or list empty; 0 else
//                           (customer_types mismatch halves the axis)
//   stage             20    full if stage_key ∈ stages; 10 if adjacent (±1 in
//                           CANONICAL_STAGES order); 0 else
//   geo               10    full if hq_state ∈ geographies or national/anz/
//                           apac/global in either; 5 if same country only
//   cheque            10    full if the founder ask overlaps [min,max] (lead)
//                           or ≤ 3× max (follow); 5 if the ask is unknown
//   tags              10    10 · matched include tags / requested; any
//                           tags_exclude hit → HARD GATE
//   floors            10    full if svi ≥ min_svi (or none) → else HARD GATE;
//                           revenue_min_aud / growth_min_pct are hard gates
//                           when data exists, 5 + "not verified" when unknown
//
// Sum 100, FIT_FLOOR stays 40. Unknown taxonomy (`unclassified`) NEVER scores
// full on its axis and adds the DQ-3 gap "industry unclassified — founder
// confirmation pending". A hard gate zeroes the whole score (the row is
// still returned with `blockers[]` so the UI can say why).
//
// Two directions, one scorer:
//   investors → startups  `rankStartupsForMandate()`  (deal-flow; the nightly
//                         mandate-fit-refresh cron persists the result to
//                         mandate_fit_scores keyed on project_id)
//   startups → investors  `rankMandatesForStartup()`  ("Investors who match"
//                         on /workspace/investors; computed live)
//
// Per-mandate `weights` override (§B.7 section 7, Program only) must cover
// the seven axes and sum to 100 — `validateWeights()`; an invalid override
// falls back to the defaults so a bad row never zeroes a fund's deal-flow.
//
// Pure: no server-only import, no DB, no Date — the cron, the API and the
// client form all import it.

import {
  CANONICAL_STAGES,
  crosswalkIndustry,
  crosswalkStage,
  isIndustry,
  isStageKey,
  type StageKey,
} from "@/lib/taxonomy/startup-taxonomy";

// ─── Weights ─────────────────────────────────────────────────────────────────

export const FIT_AXES_V2 = ["industry", "business_model", "stage", "geo", "cheque", "tags", "floors"] as const;
export type FitAxisV2 = (typeof FIT_AXES_V2)[number];

export const FIT_WEIGHTS_V2: Readonly<Record<FitAxisV2, number>> = Object.freeze({
  industry: 25,
  business_model: 15,
  stage: 20,
  geo: 10,
  cheque: 10,
  tags: 10,
  floors: 10,
});

/** Minimum score to be listed in deal-flow / "Investors who match". */
export const FIT_FLOOR_V2 = 40;

/** Partial-credit ratios (§B.8 numbers expressed against the default weights). */
export const FIT_PARTIAL = Object.freeze({
  /** 12 of 25 — only `industry_secondary` matches, or include empty but industry unclassified (DQ-3). */
  industrySecondary: 12 / 25,
  /** 10 of 20 — adjacent canonical stage. */
  stageAdjacent: 0.5,
  /** 5 of 10 — same country only. */
  geoSameCountry: 0.5,
  /** 5 of 10 — founder ask unknown. */
  chequeUnknown: 0.5,
  /** 5 of 10 — a floor is set but the data is not verified. */
  floorsUnknown: 0.5,
  /** business_model list empty but startup unclassified (DQ-3) / customer type mismatch. */
  businessModelHalf: 0.5,
});

export type WeightsValidation =
  | { ok: true; weights: Record<FitAxisV2, number>; overridden: boolean }
  | { ok: false; error: string };

/**
 * Validate a per-mandate override. Missing axes take the default weight;
 * every value must be a finite integer 0..100 and the seven must sum to 100.
 * `null` / `{}` = no override (defaults, `overridden:false`).
 */
export function validateWeights(input: unknown): WeightsValidation {
  if (input == null) return { ok: true, weights: { ...FIT_WEIGHTS_V2 }, overridden: false };
  if (typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "weights must be an object" };
  const obj = input as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0) return { ok: true, weights: { ...FIT_WEIGHTS_V2 }, overridden: false };
  const unknown = keys.filter((k) => !(FIT_AXES_V2 as readonly string[]).includes(k));
  if (unknown.length) return { ok: false, error: `unknown axis: ${unknown.join(", ")}` };
  const out: Record<FitAxisV2, number> = { ...FIT_WEIGHTS_V2 };
  for (const axis of FIT_AXES_V2) {
    if (!(axis in obj)) continue;
    const v = obj[axis];
    if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v) || v < 0 || v > 100) {
      return { ok: false, error: `${axis} must be an integer 0–100` };
    }
    out[axis] = v;
  }
  const sum = FIT_AXES_V2.reduce((acc, a) => acc + out[a], 0);
  if (sum !== 100) return { ok: false, error: `weights must sum to 100 (got ${sum})` };
  return { ok: true, weights: out, overridden: true };
}

/** Defaults when the override is absent or invalid — never throws. */
export function resolveWeights(input: unknown): Record<FitAxisV2, number> {
  const v = validateWeights(input);
  return v.ok ? v.weights : { ...FIT_WEIGHTS_V2 };
}

// ─── Inputs ──────────────────────────────────────────────────────────────────

export type LeadOrFollow = "lead" | "follow" | "both";

/** The mandate columns the scorer reads (a subset of `InvestorMandate`). */
export interface FitMandate {
  id?: string | null;
  sectors_include: readonly string[];
  sectors_exclude: readonly string[];
  business_models: readonly string[];
  customer_types: readonly string[];
  stages: readonly string[];
  cheque_min_aud: number | null;
  cheque_max_aud: number | null;
  lead_or_follow: LeadOrFollow | null;
  geographies: readonly string[];
  revenue_min_aud: number | null;
  growth_min_pct: number | null;
  min_svi: number | null;
  tags_include: readonly string[];
  tags_exclude: readonly string[];
  weights?: Record<string, number> | null;
}

/** The `startup_taxonomy` columns the scorer reads. */
export interface FitStartupTaxonomy {
  industry: string;
  industry_secondary: string | null;
  business_model: string;
  customer_types: readonly string[];
  stage_key: string;
  hq_state: string | null;
  hq_country: string | null;
  geo_scope: string | null;
  tags: readonly string[];
}

export interface FitStartup {
  project_id: string | null;
  /** null = no startup_taxonomy row yet (every axis behaves as unclassified). */
  taxonomy: FitStartupTaxonomy | null;
  /** Latest SVI 0–100; null = not scored. */
  svi: number | null;
  /** Fallbacks used only when `taxonomy` is null. */
  stage_key?: string | null;
  state?: string | null;
  /** Verified traction; null = unknown ("not verified"). */
  revenue_aud?: number | null;
  growth_pct?: number | null;
  /** Founder ask (funding intake raise / analysis targetRaise); null = unknown. */
  raise_aud?: number | null;
}

// ─── Output ──────────────────────────────────────────────────────────────────

export interface FitAxisResult {
  axis: FitAxisV2;
  weight: number;
  /** 0..1 share of the axis weight awarded. */
  ratio: number;
  /** round(ratio × weight). */
  points: number;
  reason: string | null;
  gap: string | null;
  /** Hard gate hit on this axis (zeroes the whole score). */
  blocker: string | null;
}

export interface FitResult {
  /** 0–100; 0 whenever any blocker fired. */
  score: number;
  breakdown: FitAxisResult[];
  blockers: string[];
  reasons: string[];
  gaps: string[];
  passes_floor: boolean;
  /** True when the per-mandate weights override was applied. */
  weights_overridden: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WIDE_GEOS = new Set(["national", "anz", "apac", "global"]);
const AU_STATES = new Set(["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]);

const UNCLASSIFIED_INDUSTRY_GAP = "industry unclassified — founder confirmation pending";
const UNCLASSIFIED_MODEL_GAP = "business model unclassified — founder confirmation pending";

function lower(list: readonly string[]): string[] {
  return list.map((s) => String(s).trim().toLowerCase()).filter(Boolean);
}
function upper(list: readonly string[]): string[] {
  return list.map((s) => String(s).trim().toUpperCase()).filter(Boolean);
}
function pts(ratio: number, weight: number): number {
  return Math.round(Math.max(0, Math.min(1, ratio)) * weight);
}
function axis(a: FitAxisV2, weight: number, ratio: number, reason: string | null, gap: string | null, blocker: string | null = null): FitAxisResult {
  return { axis: a, weight, ratio: blocker ? 0 : ratio, points: blocker ? 0 : pts(ratio, weight), reason, gap, blocker };
}
function human(s: string): string {
  return s.replace(/_/g, " ");
}
function labelList(list: readonly string[], max = 3): string {
  const l = list.slice(0, max).map(human).join(", ");
  return list.length > max ? `${l} +${list.length - max}` : l;
}

/** Effective taxonomy for a startup — the row, or a fallback built from the legacy fields. */
function effectiveTaxonomy(s: FitStartup): FitStartupTaxonomy {
  if (s.taxonomy) return s.taxonomy;
  const state = s.state ? String(s.state).trim() : null;
  const st = state ? state.toUpperCase() : null;
  return {
    industry: "unclassified",
    industry_secondary: null,
    business_model: "unclassified",
    customer_types: [],
    stage_key: s.stage_key && isStageKey(s.stage_key) ? s.stage_key : "idea",
    hq_state: st && (AU_STATES.has(st) || st === "NATIONAL") ? (st === "NATIONAL" ? "national" : st) : null,
    hq_country: "AU",
    geo_scope: null,
    tags: [],
  };
}

/**
 * Build a `FitStartup` from the legacy `InvestorMatchProject` shape
 * (free-text industry, numeric / intake stage, AU state) when no
 * startup_taxonomy row exists — crosswalked, never guessed beyond the map.
 */
export function fitStartupFromLegacy(input: {
  id: string | null;
  industry: string | null;
  stage: number | string | null;
  state: string | null;
  svi: number | null;
  raise_aud?: number | null;
}): FitStartup {
  const industry = crosswalkIndustry(input.industry);
  const stage_key = crosswalkStage(input.stage);
  const st = input.state ? String(input.state).trim().toUpperCase() : null;
  return {
    project_id: input.id,
    taxonomy: {
      industry,
      industry_secondary: null,
      business_model: "unclassified",
      customer_types: [],
      stage_key,
      hq_state: st && AU_STATES.has(st) ? st : st === "NATIONAL" ? "national" : null,
      hq_country: "AU",
      geo_scope: null,
      tags: [],
    },
    svi: input.svi,
    raise_aud: input.raise_aud ?? null,
    revenue_aud: null,
    growth_pct: null,
  };
}

// ─── Axes ────────────────────────────────────────────────────────────────────

function scoreIndustry(m: FitMandate, t: FitStartupTaxonomy, w: number): FitAxisResult {
  const include = lower(m.sectors_include);
  const exclude = lower(m.sectors_exclude);
  const ind = t.industry.toLowerCase();
  const sec = t.industry_secondary ? t.industry_secondary.toLowerCase() : null;
  const unclassified = !isIndustry(ind) || ind === "unclassified";

  if (!unclassified && exclude.includes(ind)) {
    return axis("industry", w, 0, null, `Excludes ${human(ind)}`, "industry_excluded");
  }
  if (include.length === 0) {
    return unclassified
      ? axis("industry", w, FIT_PARTIAL.industrySecondary, null, UNCLASSIFIED_INDUSTRY_GAP)
      : axis("industry", w, 1, "Sector-agnostic", null);
  }
  if (unclassified) return axis("industry", w, 0, null, UNCLASSIFIED_INDUSTRY_GAP);
  if (include.includes(ind)) return axis("industry", w, 1, `Invests in ${human(ind)}`, null);
  if (sec && include.includes(sec) && !exclude.includes(sec)) {
    return axis("industry", w, FIT_PARTIAL.industrySecondary, `Secondary sector ${human(sec)} fits`, `Primary sector ${human(ind)} outside their focus`);
  }
  return axis("industry", w, 0, null, `Sector ${human(ind)} outside their focus (${labelList(include)})`);
}

function scoreBusinessModel(m: FitMandate, t: FitStartupTaxonomy, w: number): FitAxisResult {
  const models = lower(m.business_models);
  const bm = t.business_model.toLowerCase();
  const unclassified = bm === "unclassified" || !bm;
  const ctWant = lower(m.customer_types);
  const ctHave = lower(t.customer_types);
  const ctMismatch = ctWant.length > 0 && ctHave.length > 0 && !ctHave.some((c) => ctWant.includes(c));
  const ctGap = ctMismatch ? `Customer type ${labelList(ctHave)} outside ${labelList(ctWant)}` : null;

  let ratio: number;
  let reason: string | null = null;
  let gap: string | null = null;
  if (models.length === 0) {
    if (unclassified) {
      ratio = FIT_PARTIAL.businessModelHalf;
      gap = UNCLASSIFIED_MODEL_GAP;
    } else {
      ratio = 1;
      reason = "Any business model";
    }
  } else if (unclassified) {
    ratio = 0;
    gap = UNCLASSIFIED_MODEL_GAP;
  } else if (models.includes(bm)) {
    ratio = 1;
    reason = `Backs ${human(bm)} businesses`;
  } else {
    ratio = 0;
    gap = `Business model ${human(bm)} outside ${labelList(models)}`;
  }
  if (ctMismatch) {
    ratio *= FIT_PARTIAL.businessModelHalf;
    gap = gap ? `${gap}; ${ctGap}` : ctGap;
  }
  return axis("business_model", w, ratio, reason, gap);
}

function scoreStage(m: FitMandate, t: FitStartupTaxonomy, w: number): FitAxisResult {
  const stages = lower(m.stages).filter((s): s is StageKey => isStageKey(s));
  const sk = t.stage_key.toLowerCase();
  if (!isStageKey(sk)) return axis("stage", w, 0, null, "Stage unknown");
  if (stages.length === 0) return axis("stage", w, 1, "Any stage", null);
  if (stages.includes(sk)) return axis("stage", w, 1, `Backs ${labelList(stages)} rounds`, null);
  const idx = CANONICAL_STAGES.indexOf(sk);
  const adjacent = stages.some((s) => Math.abs(CANONICAL_STAGES.indexOf(s) - idx) === 1);
  if (adjacent) return axis("stage", w, FIT_PARTIAL.stageAdjacent, `${human(sk)} is one step from their ${labelList(stages)} focus`, `Stage ${human(sk)} is adjacent, not core`);
  return axis("stage", w, 0, null, `Stage ${human(sk)} outside ${labelList(stages)}`);
}

function scoreGeo(m: FitMandate, t: FitStartupTaxonomy, w: number): FitAxisResult {
  const geos = m.geographies.map((g) => String(g).trim()).filter(Boolean);
  if (geos.length === 0) return axis("geo", w, 1, "Any geography", null);
  const geosUpper = upper(geos);
  const geosLower = lower(geos);
  const mandateWide = geosLower.some((g) => WIDE_GEOS.has(g));
  const mandateAuState = geosUpper.some((g) => AU_STATES.has(g));
  const hqState = t.hq_state ? String(t.hq_state).trim() : null;
  const hqUpper = hqState ? hqState.toUpperCase() : null;
  const country = (t.hq_country ?? "AU").toUpperCase();
  const startupWide = (t.geo_scope && WIDE_GEOS.has(t.geo_scope.toLowerCase())) || hqUpper === "NATIONAL";

  if (hqUpper && geosUpper.includes(hqUpper)) return axis("geo", w, 1, `Invests in ${hqState}`, null);
  if (mandateWide && country === "AU") return axis("geo", w, 1, `Invests ${labelList(geosLower.filter((g) => WIDE_GEOS.has(g)))}-wide`, null);
  if (startupWide && mandateAuState && country === "AU") return axis("geo", w, 1, "National footprint covers their states", null);
  if (country === "AU" && (mandateAuState || mandateWide)) {
    return axis("geo", w, FIT_PARTIAL.geoSameCountry, "Same country", `Based ${hqState ? `in ${hqState}` : "outside"}, they focus on ${labelList(geos)}`);
  }
  return axis("geo", w, 0, null, `Outside their ${labelList(geos)} geography`);
}

function scoreCheque(m: FitMandate, s: FitStartup, w: number): FitAxisResult {
  const min = typeof m.cheque_min_aud === "number" ? m.cheque_min_aud : null;
  const max = typeof m.cheque_max_aud === "number" ? m.cheque_max_aud : null;
  if (min === null && max === null) return axis("cheque", w, 1, "No cheque constraint", null);
  const ask = typeof s.raise_aud === "number" && Number.isFinite(s.raise_aud) ? s.raise_aud : null;
  if (ask === null) return axis("cheque", w, FIT_PARTIAL.chequeUnknown, null, "Raise amount not stated");
  const mode: LeadOrFollow = m.lead_or_follow ?? "both";
  const leadOk = (min === null || ask >= min) && (max === null || ask <= max);
  const followOk = max !== null ? ask <= 3 * max : min === null || ask >= min;
  const ok = mode === "lead" ? leadOk : mode === "follow" ? followOk : leadOk || followOk;
  if (ok) return axis("cheque", w, 1, `Ask A$${fmt(ask)} fits their ${chequeRange(min, max)} cheque`, null);
  return axis("cheque", w, 0, null, `Ask A$${fmt(ask)} outside their ${chequeRange(min, max)} cheque${mode === "follow" ? " (follow ≤ 3×)" : ""}`);
}

function scoreTags(m: FitMandate, t: FitStartupTaxonomy, w: number): FitAxisResult {
  const include = lower(m.tags_include);
  const exclude = lower(m.tags_exclude);
  const have = lower(t.tags);
  const excluded = have.filter((x) => exclude.includes(x));
  if (excluded.length) return axis("tags", w, 0, null, `Excludes ${labelList(excluded)}`, "tag_excluded");
  if (include.length === 0) return axis("tags", w, 1, null, null);
  const matched = include.filter((x) => have.includes(x));
  const ratio = matched.length / include.length;
  if (matched.length === include.length) return axis("tags", w, 1, `Matches ${labelList(matched)}`, null);
  const missing = include.filter((x) => !have.includes(x));
  return axis("tags", w, ratio, matched.length ? `Matches ${labelList(matched)}` : null, `Missing ${labelList(missing)}`);
}

function scoreFloors(m: FitMandate, s: FitStartup, w: number): FitAxisResult {
  const reasons: string[] = [];
  const gaps: string[] = [];
  let blocker: string | null = null;
  let unknown = false;
  let any = false;

  if (typeof m.min_svi === "number" && m.min_svi > 0) {
    any = true;
    if (s.svi === null || !Number.isFinite(s.svi) || s.svi < m.min_svi) {
      blocker = "svi_floor";
      gaps.push(s.svi === null ? `SVI not scored (floor ${m.min_svi})` : `SVI ${Math.round(s.svi as number)} below their ${m.min_svi} floor`);
    } else reasons.push(`SVI ${Math.round(s.svi)} clears their ${m.min_svi} floor`);
  }
  if (typeof m.revenue_min_aud === "number" && m.revenue_min_aud > 0) {
    any = true;
    const rev = typeof s.revenue_aud === "number" ? s.revenue_aud : null;
    if (rev === null) {
      unknown = true;
      gaps.push("revenue not verified");
    } else if (rev < m.revenue_min_aud) {
      blocker = blocker ?? "revenue_floor";
      gaps.push(`Revenue A$${fmt(rev)} below their A$${fmt(m.revenue_min_aud)} floor`);
    } else reasons.push(`Revenue A$${fmt(rev)} clears their floor`);
  }
  if (typeof m.growth_min_pct === "number" && m.growth_min_pct > 0) {
    any = true;
    const g = typeof s.growth_pct === "number" ? s.growth_pct : null;
    if (g === null) {
      unknown = true;
      gaps.push("growth not verified");
    } else if (g < m.growth_min_pct) {
      blocker = blocker ?? "growth_floor";
      gaps.push(`Growth ${g}% below their ${m.growth_min_pct}% floor`);
    } else reasons.push(`Growth ${g}% clears their floor`);
  }
  if (!any) return axis("floors", w, 1, "No traction floors", null);
  const ratio = blocker ? 0 : unknown ? FIT_PARTIAL.floorsUnknown : 1;
  return axis("floors", w, ratio, reasons.length ? reasons.join("; ") : null, gaps.length ? gaps.join("; ") : null, blocker);
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
}
function chequeRange(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `A$${fmt(min)}–${fmt(max)}`;
  if (min !== null) return `≥ A$${fmt(min)}`;
  return `≤ A$${fmt(max as number)}`;
}

// ─── Scorer ──────────────────────────────────────────────────────────────────

/** Score ONE mandate against ONE startup. Pure; never throws. */
export function scoreFit(mandate: FitMandate, startup: FitStartup): FitResult {
  const wv = validateWeights(mandate.weights ?? null);
  const weights = wv.ok ? wv.weights : { ...FIT_WEIGHTS_V2 };
  const t = effectiveTaxonomy(startup);

  const breakdown: FitAxisResult[] = [
    scoreIndustry(mandate, t, weights.industry),
    scoreBusinessModel(mandate, t, weights.business_model),
    scoreStage(mandate, t, weights.stage),
    scoreGeo(mandate, t, weights.geo),
    scoreCheque(mandate, startup, weights.cheque),
    scoreTags(mandate, t, weights.tags),
    scoreFloors(mandate, startup, weights.floors),
  ];
  const blockers = breakdown.map((b) => b.blocker).filter((b): b is string => !!b);
  const raw = breakdown.reduce((acc, b) => acc + b.points, 0);
  const score = blockers.length ? 0 : Math.max(0, Math.min(100, raw));
  return {
    score,
    breakdown,
    blockers,
    reasons: breakdown.map((b) => b.reason).filter((r): r is string => !!r),
    gaps: breakdown.map((b) => b.gap).filter((g): g is string => !!g),
    passes_floor: score >= FIT_FLOOR_V2,
    weights_overridden: wv.ok ? wv.overridden : false,
  };
}

export interface RankedFit<T> {
  item: T;
  fit: FitResult;
}

/** Deal-flow direction: startups for one mandate, best first, floor applied. */
export function rankStartupsForMandate<T extends FitStartup>(
  mandate: FitMandate,
  startups: readonly T[],
  opts: { floor?: number; limit?: number } = {},
): RankedFit<T>[] {
  const floor = opts.floor ?? FIT_FLOOR_V2;
  const out: RankedFit<T>[] = [];
  for (const s of startups) {
    const fit = scoreFit(mandate, s);
    if (fit.score >= floor) out.push({ item: s, fit });
  }
  out.sort((a, b) => b.fit.score - a.fit.score || (a.item.project_id ?? "").localeCompare(b.item.project_id ?? ""));
  return typeof opts.limit === "number" ? out.slice(0, Math.max(0, opts.limit)) : out;
}

/** Founder direction: mandates for one startup, best first, floor applied. */
export function rankMandatesForStartup<T extends FitMandate>(
  startup: FitStartup,
  mandates: readonly T[],
  opts: { floor?: number; limit?: number } = {},
): RankedFit<T>[] {
  const floor = opts.floor ?? FIT_FLOOR_V2;
  const out: RankedFit<T>[] = [];
  for (const m of mandates) {
    const fit = scoreFit(m, startup);
    if (fit.score >= floor) out.push({ item: m, fit });
  }
  out.sort((a, b) => b.fit.score - a.fit.score || (a.item.id ?? "").localeCompare(b.item.id ?? ""));
  return typeof opts.limit === "number" ? out.slice(0, Math.max(0, opts.limit)) : out;
}

/** An empty mandate ("anything goes") — handy for tests and the prefs read-through. */
export function emptyFitMandate(overrides: Partial<FitMandate> = {}): FitMandate {
  return {
    id: null,
    sectors_include: [],
    sectors_exclude: [],
    business_models: [],
    customer_types: [],
    stages: [],
    cheque_min_aud: null,
    cheque_max_aud: null,
    lead_or_follow: null,
    geographies: [],
    revenue_min_aud: null,
    growth_min_pct: null,
    min_svi: null,
    tags_include: [],
    tags_exclude: [],
    weights: null,
    ...overrides,
  };
}
