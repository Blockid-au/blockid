// dashboard-v4 — G34 BT3 (RQ01): the investor-first page 1 of the Trusted
// Business Report as ONE pure projection (spec docs/design/tbr-v4-dashboard-
// spec.md §1, §3–§5, §7). Composed from the existing view-models — never a
// parallel scorer:
//
//   buildDashboardView   → SVI / evidence / valuation tile figures
//   investmentViewFor    → Investor Score composite, band A–D (meeting label),
//                          unverified claims, ask verdict, reasons / risks
//   buildInvestorScreening → signal STATUS chips, cited strengths / gaps /
//                          questions, D24-b free gating (`detailLocked`)
//
// Returns the 5 tiles, the 6 key metrics (ARR / growth only when evidenced;
// NRR, gross margin, runway and burn multiple always "Not evidenced" until a
// CFO/CRO module with evidence ids supplies them — never derived), the
// 8-row scorecard (lead agent from dimension-owners, stage emphasis BAND from
// the screening registry — D24-f, no weight), deterministic red flags
// de-duplicated against the grounded deal-breakers, the why / stop / ask
// lists (≤ 3 each) and the degraded state. G34 BT6 adds the peer position
// (RQ19, published cohort percentile only), the stage ladder (RQ20, from
// verified evidence, separate from quality), the calibration disclosure
// (RQ21, the published backtest the caller loads), round readiness (RQ27,
// a module output backed by evidence — also the only runway source) and
// the spike flag (RQ28, published p90). Web, PDF, DOCX and the e-mail
// summary all print from this object, so page 1 is the same everywhere.
//
// Free tier (D24-b): nothing on page 1 is locked — scores, bands, labels and
// signal status stay visible — but no locked-chapter finding, bullet,
// citation or evidence label enters the lists (the screening gate plus the
// locked-dimension filter below). Pure, client-safe, adds no new score.

import type { SviBacktestHeadline } from "@/lib/backtest/latest";
import { benchmarkBand, mayShowPercentile } from "@/lib/benchmarks/publication-rules";
import { getTbrStrings } from "@/lib/i18n/tbr-strings";
import { getTbrV3Strings } from "@/lib/i18n/tbr-v3-strings";
import { DIM_ORDER, dimensionOwner, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import type { AgentRole } from "@/lib/report-pipeline/types";
import { aud } from "@/lib/report-visuals/svg";
import type { Band } from "@/lib/report-visuals/types";
import { emphasisFor, screeningStageFor, type EmphasisBand, type ScreeningDimension, type ScreeningStage } from "@/lib/screening/registry";
import type { AssessmentCardData } from "@/lib/svi/assessment-card";
import { stripCitationMarkers } from "./citations";
import { coverValuationPending } from "./cover-hero";
import { buildDashboardView, type DashboardView } from "./dashboard-view";
import { dashboardV4Strings, type DashboardV4Strings } from "./dashboard-v4-strings";
import { ensureExecutiveStructured } from "./executive-structure";
import { clause, dimName, investmentLocale, investmentViewFor, isAssessed, type InvestmentLocale } from "./investment-view";
import { buildInvestorScreening, type InvestorScreeningSignal, type InvestorSignalKey } from "./investor-screening";
import { isValuationAvailable, type EvidenceRow, type InvestmentBand, type InvestmentView, type ReportV2 } from "./schema";

// ── Types ────────────────────────────────────────────────────────────────────

export type V4TileId = "valuation" | "svi" | "investor" | "evidence" | "verification";

export interface V4Tile {
  id: V4TileId;
  label: string;
  /** The big mono figure; the valuation tile's "not estimable" sentence when unavailable. */
  value: string;
  sub: string;
  note: string;
  band?: Band;
  /** "unavailable" = valuation not estimable / composite pending; never a placeholder figure. */
  state: "ok" | "unavailable";
}

export interface V4ValuationTile extends V4Tile {
  id: "valuation";
  /** The range bar (present only when a range is published). */
  range: { lowAud: number; midAud: number; highAud: number } | null;
  /** What evidence would unlock a method (unavailable state only). */
  unlockHint: string | null;
}

export interface V4EvidenceTile extends V4Tile {
  id: "evidence";
  pct: number;
  /** 0–6 filled segments of the confidence meter. */
  segments: number;
}

export type V4MetricId = "arr" | "growth" | "nrr" | "gross_margin" | "runway" | "burn_multiple";
export type V4MetricStatus = "verified" | "company_stated" | "stated" | "observed" | "assumed" | "not_evidenced";

export interface V4Metric {
  id: V4MetricId;
  label: string;
  /** Null = not evidenced (printed as the status, never 0 or blank). */
  value: string | null;
  status: V4MetricStatus;
  statusLabel: string;
  /** "Stripe · Sep 2026" when a register row backs the figure. */
  source: string | null;
}

export interface V4ScoreRow {
  dim: DimKey;
  /** "TRE" */
  code: string;
  title: string;
  lead: AgentRole;
  /** "CRO" */
  leadCode: string;
  emphasis: EmphasisBand;
  emphasisLabel: string;
  /** Null = pending (printed "—", never 0). */
  score: number | null;
  band: Band;
  bandLabel: string;
  /** The chapter's stored evidence-confidence factor × 100; null when pending / not stored. */
  evidencePct: number | null;
  /** 0–6 filled segments of the confidence meter. */
  segments: number;
  /** Only when a previous revision used the same method (not stored yet → always null). */
  trend: { delta: number; label: string } | null;
  href: string;
  pending: boolean;
  /** Written analysis unavailable for this chapter (quality.degradedSections / chapter.degraded). */
  degraded: boolean;
  /** Free tier: the chapter's detail is in the full report (score / band stay visible, D24-b). */
  locked: boolean;
  ariaLabel: string;
}

export type V4RedFlagKind = "ask" | "cap_table" | "blocker" | "unverified" | "consistency" | "stale" | "degraded";

export interface V4RedFlag {
  id: string;
  kind: V4RedFlagKind;
  text: string;
  evidenceIds: string[];
  /** The investor signal this flag already covers (dedupes the matching deal-breaker). */
  signalKey?: InvestorSignalKey;
}

export interface V4ListItem {
  /** May carry `[ev:]` markers — web / PDF render them as footnotes, e-mail strips them. */
  text: string;
  signalKey?: InvestorSignalKey;
  dim?: DimKey;
  evidenceIds: string[];
}

export interface V4SignalChip {
  key: InvestorSignalKey;
  label: string;
  status: InvestorScreeningSignal["status"];
  statusLabel: string;
  summary: string;
  detailLocked: boolean;
  href: string;
}

/** RQ19: the published cohort percentile (n ≥ 10), or "peer set too small" when only a sub-floor n is stored. */
export interface V4PeerPosition {
  state: "published" | "too_small";
  /** Null when too small — never computed here. */
  percentile: number | null;
  n: number;
  text: string;
}

export type V4LadderStep = 1 | 2 | 3 | 4 | 5;

/** RQ20: commercial maturity (Idea → Established), separate from the quality scores. */
export interface V4StageLadder {
  step: V4LadderStep;
  label: string;
  /** "●●●○○" */
  dots: string;
  /** "●●●○○ Early revenue" */
  text: string;
  /** What moved the ladder: source type + month only (never a row label — D24-b). */
  basis: string;
  ariaLabel: string;
}

/** RQ28: one or two dimensions at or above the published p90 of the stage cohort. */
export interface V4Spike {
  dims: DimKey[];
  text: string;
}

/** RQ27: last round + runway, only from a module output backed by non-self-declared evidence. */
export interface V4RoundReadiness {
  lastRound: string;
  runwayMonths: number;
  source: string;
  text: string;
}

/** RQ21: the SVI backtest disclosure (always present). */
export interface V4Calibration {
  /** published = ρ with n ≥ 10 · pending = no backtest / too few rows · unknown = the surface did not load it. */
  state: "published" | "pending" | "unknown";
  rho: number | null;
  n: number | null;
  asOf: string | null;
  text: string;
  href: string;
  linkLabel: string;
}

export interface DashboardV4 {
  locale: InvestmentLocale;
  strings: DashboardV4Strings;
  tiles: [V4ValuationTile, V4Tile, V4Tile, V4EvidenceTile, V4Tile];
  meeting: { band: InvestmentBand; label: string; wording: string; subline: string; rule: string; thesis: string };
  keyMetrics: [V4Metric, V4Metric, V4Metric, V4Metric, V4Metric, V4Metric];
  stage: ScreeningStage;
  stageName: string;
  scorecard: V4ScoreRow[];
  redFlags: V4RedFlag[];
  lists: { why: V4ListItem[]; stop: V4ListItem[]; ask: V4ListItem[]; lockedDims: number };
  signalChips: V4SignalChip[];
  scopeNote: string;
  degraded: { sections: string[]; banner: string } | null;
  lockCards: boolean;
  /** G34 BT6 — null / omitted when the report carries no data for the line. */
  peer: V4PeerPosition | null;
  stageLadder: V4StageLadder;
  spike: V4Spike | null;
  roundReadiness: V4RoundReadiness | null;
  calibration: V4Calibration;
}

export interface DashboardV4Options {
  locale?: string;
  /** Free-tier gate for the lists (defaults to `report.tier === "free"`, as `buildInvestorScreening`). */
  lockCards?: boolean;
  /** A dashboard view the caller already built (same report / card / view). */
  dash?: DashboardView;
  /**
   * RQ21: the published SVI backtest headline (server: `readSviBacktestHeadline()`).
   * null = loaded, nothing published ("calibration pending"); omitted = this
   * surface did not load it (the line links the methodology without figures).
   */
  calibration?: SviBacktestHeadline | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const LIST_MAX = 3;
const METER_SEGMENTS = 6;
/** Sources whose rows count as a system of record (T1) for revenue. */
const T1_SOURCES = new Set<EvidenceRow["source"]>(["stripe", "xero", "connector_other"]);
const T1_CONFIDENCE = new Set(["connected_source", "transaction_data", "third_party_verified"]);
const CAP_TABLE_RE = /cap[\s-]?table|share\s+register|shareholder|esop\s+pool/i;
const FLAG_ORDER: Record<V4RedFlagKind, number> = { ask: 0, cap_table: 1, blocker: 2, unverified: 3, consistency: 4, stale: 5, degraded: 6 };

const segmentsFor = (pct: number | null): number => (pct === null ? 0 : Math.max(0, Math.min(METER_SEGMENTS, Math.round((pct / 100) * METER_SEGMENTS))));
const norm = (s: string): string => stripCitationMarkers(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const stageNames: Record<InvestmentLocale, Record<ScreeningStage, string>> = {
  en: { PS: "pre-seed", S: "seed", A: "Series A", "B+": "Series B and later" },
  vi: { PS: "tiền hạt giống", S: "hạt giống", A: "Series A", "B+": "Series B trở đi" },
};

function monthYear(iso: string | undefined, locale: InvestmentLocale): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale === "vi" ? "vi-VN" : "en-AU", { month: "short", year: "numeric" });
}

/** Every evidence row the document stores, register first, de-duplicated by id. */
function allEvidence(report: ReportV2): EvidenceRow[] {
  const seen = new Set<string>();
  const out: EvidenceRow[] = [];
  for (const row of [...report.appendix.evidenceRegister, ...report.dimensions.flatMap((d) => d.evidence)]) {
    const id = row.evidence_id.trim().toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

/** The register row that backs revenue: evidenced, TRE, never self-declared. */
function revenueEvidence(rows: readonly EvidenceRow[]): { row: EvidenceRow; tier: "T1" | "T3" } | null {
  const candidates = rows.filter((r) => r.status === "evidenced" && r.dims.includes("tre") && r.source !== "self_declared" && r.confidence !== undefined && r.confidence !== "self_declared");
  const t1 = candidates.find((r) => T1_SOURCES.has(r.source) && T1_CONFIDENCE.has(r.confidence!));
  if (t1) return { row: t1, tier: "T1" };
  const t3 = candidates.find((r) => r.source === "upload" && /revenue|p&l|profit|financial|arr|mrr|invoice|bank/i.test(r.label));
  return t3 ? { row: t3, tier: "T3" } : null;
}

function pctLabel(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

// ── G34 BT6: peer position, stage ladder, spike, round readiness, calibration ──

export const CALIBRATION_HREF = "/methodology/calibration";
/** RQ20 ladder thresholds on connector-evidenced (T1) ARR — maturity only, never a quality score. */
export const LADDER_SCALING_ARR_AUD = 1_000_000;
export const LADDER_ESTABLISHED_ARR_AUD = 10_000_000;
/** RQ28: a published dimension percentile at or above this sits in the top 10 % of the stage cohort. */
export const SPIKE_PERCENTILE = 90;
/** RQ27: the module output keys a CFO / CGH producer must write (G34 BT5 RQ15) — nothing else is read. */
export const ROUND_READINESS_KEYS = { lastRoundDate: "lastRoundDate", runwayMonths: "runwayMonths", evidenceIds: "evidenceIds" } as const;

/** Sources that can carry customer evidence (never self-declared, a founder profile or web traffic). */
const CUSTOMER_SOURCES = new Set<EvidenceRow["source"]>(["stripe", "xero", "upload", "connector_other", "url", "external"]);
const CUSTOMER_CONFIDENCE = new Set(["document_uploaded", "connected_source", "transaction_data", "third_party_verified"]);
const CUSTOMER_RE = /\b(customers?|clients?|pilots?|lois?|letters? of intent|wait-?lists?|sign-?ups?|subscribers?|purchase orders?|contracts?|paying)\b/i;

/** Evidenced, non-self-declared row (the bar every BT6 line holds evidence to). */
function verifiedRow(r: EvidenceRow): boolean {
  return r.status === "evidenced" && r.source !== "self_declared" && r.source !== "founder_profile" && r.confidence !== undefined && r.confidence !== "self_declared";
}

function evidenceSourceLabel(row: EvidenceRow, s: DashboardV4Strings, locale: InvestmentLocale): string {
  return [s.source[row.source] ?? row.source, monthYear(row.observedAt, locale)].filter(Boolean).join(" · ");
}

function stageLadderFor(report: ReportV2, rows: readonly EvidenceRow[], s: DashboardV4Strings, locale: InvestmentLocale): V4StageLadder {
  const revenue = revenueEvidence(rows);
  const v = report.valuation;
  const inputs = isValuationAvailable(v) ? v.inputs : undefined;
  // Scaling / Established need the ARR figure itself to come from the connected source.
  const t1Arr = revenue?.tier === "T1" && inputs?.revenueSource === "connector" && inputs.arrAud > 0 ? inputs.arrAud : 0;
  const customer = rows.find((r) => verifiedRow(r) && CUSTOMER_SOURCES.has(r.source) && CUSTOMER_CONFIDENCE.has(r.confidence!) && (r.dims.includes("tre") || r.dims.includes("mpc")) && CUSTOMER_RE.test(`${r.label} ${r.value ?? ""}`));
  let step: V4LadderStep = 1;
  let basis = s.ladderBasisNone;
  if (revenue) {
    step = t1Arr >= LADDER_ESTABLISHED_ARR_AUD ? 5 : t1Arr >= LADDER_SCALING_ARR_AUD ? 4 : 3;
    basis = s.ladderBasisRevenue(evidenceSourceLabel(revenue.row, s, locale));
  } else if (customer) {
    step = 2;
    basis = s.ladderBasisCustomer(evidenceSourceLabel(customer, s, locale));
  }
  const label = s.ladderSteps[step - 1] ?? "";
  const dots = "●".repeat(step) + "○".repeat(5 - step);
  return { step, label, dots, text: `${dots} ${label}`, basis, ariaLabel: s.ladderAria(step, label) };
}

function peerPositionFor(report: ReportV2, s: DashboardV4Strings): V4PeerPosition | null {
  const svi = report.cover.svi;
  if (svi.cohortPercentile !== null && typeof svi.cohortN === "number" && mayShowPercentile(svi.cohortN)) {
    const n = Math.floor(svi.cohortN);
    return { state: "published", percentile: svi.cohortPercentile, n, text: s.peerPublished(svi.cohortPercentile, s.peerCohort(report.cover.stageLabel), n, benchmarkBand(n) === "indicative") };
  }
  // No published percentile: say how small the stored comparison set is — never compute a rank here.
  const ns = report.dimensions.map((d) => d.benchmark?.n).filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0);
  if (ns.length === 0) return null;
  const n = Math.floor(Math.max(...ns));
  return mayShowPercentile(n) ? null : { state: "too_small", percentile: null, n, text: s.peerTooSmall(n) };
}

function spikeFor(report: ReportV2, lockedDims: ReadonlySet<DimKey>, s: DashboardV4Strings, locale: InvestmentLocale): V4Spike | null {
  const published = report.dimensions.filter((d) => isAssessed(d) && d.band !== "pending" && typeof d.benchmark?.percentile === "number" && typeof d.benchmark.n === "number" && mayShowPercentile(d.benchmark.n));
  const top = published.filter((d) => (d.benchmark.percentile as number) >= SPIKE_PERCENTILE);
  if (top.length < 1 || top.length > 2) return null;
  // D24-b: a locked chapter's benchmark rank stays in the full report.
  const shown = top.filter((d) => !lockedDims.has(d.dim)).map((d) => d.dim);
  return shown.length === 0 ? null : { dims: shown, text: s.spike(shown.map((d) => dimName(d, locale)).join(" · ")) };
}

function roundReadinessFor(report: ReportV2, rows: readonly EvidenceRow[], lockedDims: ReadonlySet<DimKey>, s: DashboardV4Strings, locale: InvestmentLocale): (V4RoundReadiness & { tier: "T1" | "T3" }) | null {
  const byId = new Map(rows.map((r) => [r.evidence_id.trim().toLowerCase(), r] as const));
  for (const ch of report.dimensions) {
    if ((ch.dim !== "cgh" && ch.dim !== "iri") || lockedDims.has(ch.dim)) continue;
    for (const m of ch.modules ?? []) {
      const o = m.output ?? {};
      const date = o[ROUND_READINESS_KEYS.lastRoundDate];
      const months = o[ROUND_READINESS_KEYS.runwayMonths];
      const ids = o[ROUND_READINESS_KEYS.evidenceIds];
      if (typeof date !== "string" || typeof months !== "number" || !Number.isFinite(months) || months <= 0 || o.runwayAssumed === true) continue;
      const lastRound = monthYear(date, locale);
      if (!lastRound) continue;
      const backing = (Array.isArray(ids) ? ids : []).map((id) => (typeof id === "string" ? byId.get(id.trim().toLowerCase()) : undefined)).find((r): r is EvidenceRow => r !== undefined && verifiedRow(r));
      if (!backing) continue;
      const tier = T1_SOURCES.has(backing.source) && T1_CONFIDENCE.has(backing.confidence!) ? "T1" : "T3";
      const runwayMonths = Math.round(months);
      const source = evidenceSourceLabel(backing, s, locale);
      return { lastRound, runwayMonths, source, text: s.round(lastRound, String(runwayMonths), source), tier };
    }
  }
  return null;
}

function calibrationFor(headline: SviBacktestHeadline | null | undefined, s: DashboardV4Strings, locale: InvestmentLocale): V4Calibration {
  const base = { href: CALIBRATION_HREF, linkLabel: s.calibrationLink };
  if (headline === undefined) return { ...base, state: "unknown", rho: null, n: null, asOf: null, text: s.calibrationUnknown };
  if (headline === null || headline.rho === null || !mayShowPercentile(headline.n)) {
    return { ...base, state: "pending", rho: headline?.rho ?? null, n: headline?.n ?? null, asOf: headline?.asOf ?? null, text: s.calibrationPending(headline?.n ?? null) };
  }
  const d = new Date(headline.asOf);
  const date = Number.isNaN(d.getTime()) ? headline.asOf : d.toLocaleDateString(locale === "vi" ? "vi-VN" : "en-AU", { day: "numeric", month: "short", year: "numeric" });
  return { ...base, state: "published", rho: headline.rho, n: headline.n, asOf: headline.asOf, text: s.calibrationPublished(headline.rho.toFixed(2), headline.n, date) };
}

// ── Builder ──────────────────────────────────────────────────────────────────

export function buildDashboardV4(report: ReportV2, card: AssessmentCardData, viewIn: InvestmentView | null, opts: DashboardV4Options = {}): DashboardV4 {
  const locale = investmentLocale(opts.locale ?? report.locale);
  const s = dashboardV4Strings(locale);
  const t3 = getTbrV3Strings(locale);
  const bandWord = getTbrStrings(locale).v2.band;
  const lockCards = opts.lockCards ?? report.tier === "free";
  const view = viewIn ?? investmentViewFor(report, card, locale);
  const dash = opts.dash ?? buildDashboardView(report, card, view, locale);
  const screening = buildInvestorScreening(report, locale, lockCards);
  const c = report.cover;
  const v = report.valuation;

  // Free gate: chapters rendered as locked cards contribute scores only.
  const lockedDims = new Set<DimKey>(lockCards ? report.dimensions.filter((d) => d.renderAs === "card").map((d) => d.dim) : []);
  const lockedCriteria = new Set(report.dimensions.filter((d) => lockedDims.has(d.dim)).flatMap((d) => d.criteria.map((cr) => cr.key)));

  // ── Tiles ──
  const valuationPending = coverValuationPending(report) || !isValuationAvailable(v);
  const inputs = isValuationAvailable(v) ? v.inputs : undefined;
  const unlockHint = !valuationPending
    ? null
    : !isValuationAvailable(v) && v.missingInputs.length > 0
      ? s.unlockMissing(v.missingInputs.slice(0, 2).join(", "))
      : !inputs || inputs.revenueSource !== "connector"
        ? s.unlockRevenue
        : s.unlockEvidence;
  const valuationTile: V4ValuationTile = {
    id: "valuation",
    label: s.tileValuation,
    value: valuationPending ? s.valuationUnavailable : dash.tiles[3].value,
    sub: valuationPending ? "" : dash.tiles[3].sub,
    note: valuationPending ? "" : dash.tiles[3].note,
    state: valuationPending ? "unavailable" : "ok",
    range: !valuationPending && isValuationAvailable(v) ? { lowAud: v.consensus.lowAud, midAud: v.consensus.midAud, highAud: v.consensus.highAud } : null,
    unlockHint,
  };
  const percentile = c.svi.cohortPercentile !== null && typeof c.svi.cohortN === "number" && mayShowPercentile(c.svi.cohortN) ? `${t3.benchPercentile(c.svi.cohortPercentile)} (n = ${c.svi.cohortN})` : "";
  const sviTile: V4Tile = {
    id: "svi",
    label: s.tileSvi,
    // D22: the uncapped index — never "/100".
    value: dash.tiles[0].value,
    sub: dash.tiles[0].sub,
    note: percentile || s.sviUncapped,
    band: dash.tiles[0].band,
    state: card.svi === null ? "unavailable" : "ok",
  };
  const assessedDims = report.dimensions.filter(isAssessed).length;
  const investorTile: V4Tile = {
    id: "investor",
    label: s.tileInvestor,
    value: view.compositeScore === null ? "—" : `${view.compositeScore}/100`,
    sub: bandWord[view.compositeBand],
    note: view.compositeScore === null ? s.investorPending : s.investorOf(assessedDims),
    band: view.compositeBand,
    state: view.compositeScore === null ? "unavailable" : "ok",
  };
  const evidenceTile: V4EvidenceTile = {
    id: "evidence",
    label: s.tileEvidence,
    value: dash.tiles[1].value,
    sub: dash.tiles[1].sub,
    note: dash.tiles[1].note,
    state: "ok",
    pct: view.evidenceConfidence,
    segments: segmentsFor(view.evidenceConfidence),
  };
  const level = Math.max(0, Math.min(5, Math.round(c.verification?.level ?? 0)));
  const verificationTile: V4Tile = {
    id: "verification",
    label: s.tileVerification,
    value: `L${level}`,
    sub: s.verificationLevel[level] ?? "",
    note: s.verificationCovers[level] ?? "",
    state: "ok",
  };

  // ── Meeting label (G31 neutral wording mapped from band A–D) ──
  const x = ensureExecutiveStructured(report).executive.structured!;
  const meeting = {
    band: view.band,
    label: s.meeting[view.band],
    wording: view.bandWording,
    subline: view.subline,
    rule: s.meetingRule(view.band),
    thesis: x.headline ? clause(x.headline, 30) : "",
  };

  // ── Key metrics ──
  const rows = allEvidence(report);
  const backing = inputs && inputs.revenueSource !== "none" && inputs.revenueSource !== "founder_stated" ? revenueEvidence(rows) : null;
  const sourceLabel = backing ? [s.source[backing.row.source] ?? backing.row.source, monthYear(backing.row.observedAt, locale)].filter(Boolean).join(" · ") : null;
  const notEvidenced = (id: V4MetricId): V4Metric => ({ id, label: s.metric[id], value: null, status: "not_evidenced", statusLabel: s.metricStatus.not_evidenced, source: null });
  const arr: V4Metric =
    backing && inputs && inputs.arrAud > 0
      ? { id: "arr", label: s.metric.arr, value: aud(inputs.arrAud), status: backing.tier === "T1" ? "verified" : "company_stated", statusLabel: backing.tier === "T1" ? s.metricStatus.verified : s.metricStatus.company_stated, source: sourceLabel }
      : notEvidenced("arr");
  let growth: V4Metric = notEvidenced("growth");
  if (inputs?.growthAssumed) {
    const pct = inputs.assumedGrowthRatePct ?? inputs.monthlyGrowthRatePct;
    growth = { id: "growth", label: s.metric.growth, value: typeof pct === "number" ? s.perMonth(pctLabel(pct)) : null, status: "assumed", statusLabel: s.metricStatus.assumed, source: null };
  } else if (inputs && typeof inputs.monthlyGrowthRatePct === "number") {
    const status: V4MetricStatus = backing ? (backing.tier === "T1" ? "observed" : "company_stated") : "stated";
    growth = { id: "growth", label: s.metric.growth, value: s.perMonth(pctLabel(inputs.monthlyGrowthRatePct)), status, statusLabel: s.metricStatus[status], source: backing ? sourceLabel : null };
  }
  // NRR, gross margin, burn multiple: never derived (G34 BT5 supplies them with evidence ids).
  // Runway only from the RQ27 module output backed by a non-self-declared evidence row.
  const round = roundReadinessFor(report, rows, lockedDims, s, locale);
  const runway: V4Metric = round
    ? { id: "runway", label: s.metric.runway, value: s.runwayValue(round.runwayMonths), status: round.tier === "T1" ? "verified" : "company_stated", statusLabel: round.tier === "T1" ? s.metricStatus.verified : s.metricStatus.company_stated, source: round.source }
    : notEvidenced("runway");
  const keyMetrics: DashboardV4["keyMetrics"] = [arr, growth, notEvidenced("nrr"), notEvidenced("gross_margin"), runway, notEvidenced("burn_multiple")];

  // ── Scorecard ──
  const stage = screeningStageFor(c.stage, c.stageLabel, inputs?.stage);
  const degradedSet = new Set(report.quality.degradedSections.map((d) => d.trim().toLowerCase()));
  const byDim = new Map(report.dimensions.map((d) => [d.dim, d] as const));
  const scorecard: V4ScoreRow[] = DIM_ORDER.flatMap((dim) => {
    const ch = byDim.get(dim);
    if (!ch) return [];
    const pending = !isAssessed(ch) || ch.band === "pending";
    const band: Band = pending ? "pending" : ch.band;
    const cm = ch.scoreBreakdown?.confidenceMultiplier;
    const evidencePct = pending || typeof cm !== "number" || !Number.isFinite(cm) ? null : Math.round(cm * 100);
    const lead = dimensionOwner(dim).primary;
    const emphasis = emphasisFor(dim.toUpperCase() as ScreeningDimension, stage);
    const title = dimName(dim, locale);
    return [{
      dim,
      code: dim.toUpperCase(),
      title,
      lead,
      leadCode: lead.toUpperCase(),
      emphasis,
      emphasisLabel: s.emphasis[emphasis],
      score: pending ? null : ch.score,
      band,
      bandLabel: bandWord[band],
      evidencePct,
      segments: segmentsFor(evidencePct),
      trend: null,
      href: `#tbr-dim-${dim}`,
      pending,
      degraded: Boolean(ch.degraded) || degradedSet.has(dim),
      locked: lockedDims.has(dim),
      ariaLabel: s.scoreAria(title, pending ? null : ch.score, bandWord[band], evidencePct),
    }];
  });

  // ── Red flags (deterministic rule outputs) ──
  const redFlags: V4RedFlag[] = [];
  const ask = isValuationAvailable(v) ? v.ask : undefined;
  if (view.askVerdict === "above_consensus" && ask) redFlags.push({ id: "ask", kind: "ask", text: s.flag.ask(Math.round(ask.gapPct)), evidenceIds: [] });
  const capTable = rows.some((r) => r.status === "evidenced" && CAP_TABLE_RE.test(`${r.label} ${r.value ?? ""}`));
  if (!capTable) redFlags.push({ id: "cap-table", kind: "cap_table", text: s.flag.capTable, evidenceIds: [], signalKey: "capital_structure" });
  report.phaseGates.blockers.forEach((b, i) => {
    const text = clause(b.detail, 20);
    if (text) redFlags.push({ id: `blocker-${i}`, kind: "blocker", text, evidenceIds: [] });
  });
  if (view.unverifiedClaims >= 1) redFlags.push({ id: "unverified", kind: "unverified", text: s.flag.unverified(view.unverifiedClaims), evidenceIds: [] });
  let lockedIssues = 0;
  report.quality.consistencyIssues.forEach((issue, i) => {
    if (issue.criteria.some((k) => lockedCriteria.has(k))) {
      lockedIssues += 1;
      return;
    }
    const text = clause(issue.description, 20);
    if (text) redFlags.push({ id: `consistency-${i}`, kind: "consistency", text, evidenceIds: [] });
  });
  if (lockedIssues > 0) redFlags.push({ id: "consistency-locked", kind: "consistency", text: s.flag.consistencyLocked(lockedIssues), evidenceIds: [] });
  const stale = rows.filter((r) => r.status === "stale");
  if (stale.length > 0) redFlags.push({ id: "stale", kind: "stale", text: s.flag.stale(stale.length), evidenceIds: stale.map((r) => r.evidence_id) });
  const degradedNames = [...new Set(report.quality.degradedSections.map((d) => d.trim()).filter(Boolean))];
  if (degradedNames.length > 0) redFlags.push({ id: "degraded", kind: "degraded", text: s.flag.degraded(degradedNames.length), evidenceIds: [] });
  const seenFlag = new Set<string>();
  const flags = redFlags
    .filter((f) => {
      const key = norm(f.text);
      if (!key || seenFlag.has(key)) return false;
      seenFlag.add(key);
      return true;
    })
    .sort((a, b) => FLAG_ORDER[a.kind] - FLAG_ORDER[b.kind]);

  // ── Lists: why / stop / ask (≤ 3 each), the stop list minus every red flag ──
  const flagIds = new Set(flags.flatMap((f) => f.evidenceIds.map((id) => id.toLowerCase())));
  const flagSignals = new Set(flags.flatMap((f) => (f.signalKey ? [f.signalKey] : [])));
  const flagTexts = new Set(flags.map((f) => norm(f.text)));
  // A view point enters a free list only when it names an unlocked dimension.
  const openPoint = (p: { dim?: DimKey }) => !lockCards || (p.dim !== undefined && !lockedDims.has(p.dim));
  const fill = (base: V4ListItem[], extra: V4ListItem[], skip: (item: V4ListItem) => boolean = () => false): V4ListItem[] => {
    const out: V4ListItem[] = [];
    const seen = new Set<string>();
    for (const item of [...base, ...extra]) {
      const key = norm(item.text);
      if (!key || seen.has(key) || skip(item)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= LIST_MAX) break;
    }
    return out;
  };
  const why = fill(
    screening.strengths.map((p) => ({ text: p.text, signalKey: p.signalKey, evidenceIds: p.evidenceIds })),
    view.reasons.filter(openPoint).map((p) => ({ text: p.text, ...(p.dim ? { dim: p.dim } : {}), evidenceIds: [] })),
  );
  const stop = fill(
    screening.gaps.map((p) => ({ text: p.text, signalKey: p.signalKey, evidenceIds: p.evidenceIds })),
    view.risks.filter(openPoint).map((p) => ({ text: p.text, ...(p.dim ? { dim: p.dim } : {}), evidenceIds: [] })),
    (item) => item.evidenceIds.some((id) => flagIds.has(id.toLowerCase())) || (item.signalKey !== undefined && flagSignals.has(item.signalKey)) || flagTexts.has(norm(item.text)),
  );
  const askList = screening.questions.slice(0, LIST_MAX).map((q) => ({ text: q.text, signalKey: q.signalKey, evidenceIds: [] }));

  // ── Signal chips (status only; D24-d) ──
  const signalChips: V4SignalChip[] = screening.signals.map((sig) => ({
    key: sig.key,
    label: sig.label,
    status: sig.status,
    statusLabel: sig.statusLabel,
    summary: sig.summary,
    detailLocked: sig.detailLocked,
    href: `#investor-signal-${sig.key}`,
  }));

  // ── Degraded state ──
  const degradedLabels = degradedNames.map((d) => (DIM_ORDER.includes(d.toLowerCase() as DimKey) ? dimName(d.toLowerCase() as DimKey, locale) : d));
  const degraded = degradedLabels.length > 0 ? { sections: degradedLabels, banner: s.degradedBanner(degradedLabels.length, degradedLabels.join(", ")) } : null;

  return {
    locale,
    strings: s,
    tiles: [valuationTile, sviTile, investorTile, evidenceTile, verificationTile],
    meeting,
    keyMetrics,
    stage,
    stageName: stageNames[locale][stage],
    scorecard,
    redFlags: flags,
    lists: { why, stop, ask: askList, lockedDims: lockedDims.size },
    signalChips,
    scopeNote: screening.scopeNote,
    degraded,
    lockCards,
    peer: peerPositionFor(report, s),
    stageLadder: stageLadderFor(report, rows, s, locale),
    spike: spikeFor(report, lockedDims, s, locale),
    roundReadiness: round ? { lastRound: round.lastRound, runwayMonths: round.runwayMonths, source: round.source, text: round.text } : null,
    calibration: calibrationFor(opts.calibration, s, locale),
  };
}

/** The BT6 page-1 position line (stage ladder · peer · spike · round readiness) for the plain surfaces (e-mail, DOCX). */
export function v4PositionLine(v4: Pick<DashboardV4, "strings" | "stageLadder" | "peer" | "spike" | "roundReadiness">): string {
  const s = v4.strings;
  return [
    `${s.ladderTitle}: ${v4.stageLadder.text}`,
    v4.peer ? `${s.peerTitle}: ${v4.peer.text}` : null,
    v4.spike ? `${s.spikeTitle}: ${v4.spike.text}` : null,
    v4.roundReadiness ? v4.roundReadiness.text : null,
  ]
    .filter((x): x is string => x !== null)
    .join(" · ");
}

/** Marker-free list / flag text for the plain surfaces (e-mail, DOCX cells); an `[unevidenced]` claim keeps "(unverified)". */
export function v4PlainText(text: string): string {
  const flagged = /\[(?:unevidenced|uncited)\]/i.test(text);
  const out = stripCitationMarkers(text).replace(/\s+/g, " ").trim();
  return flagged && out ? `${out} (unverified)` : out;
}

/** "Score · band" cell text shared by the PDF / DOCX / e-mail tables ("78 · Strong", "— · Pending"). */
export function v4ScoreCell(row: Pick<V4ScoreRow, "score" | "bandLabel">): string {
  return `${row.score === null ? "—" : row.score} · ${row.bandLabel}`;
}
