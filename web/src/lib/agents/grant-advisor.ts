// src/lib/agents/grant-advisor.ts
//
// Grant advisor agent (T0240, plan docs/plans/money-finder-2026-09-10.md
// §4c, §5c/§5d, §6f). Deterministic AU grant / program matcher, a 12-month
// action timeline and an audited LLM narrative on top.
//
//   matchGrants(profile, grants, today?)            → ScoredGrant[]   (pure)
//   matchPrograms(profile, programs, today?)        → ScoredProgram[] (pure)
//   buildTimeline(profile, grants, programs, today?) → TimelineItem[] (pure)
//   narrateFundingPlan(profile, top)                → LLM (grant-advisor-narrative.ts)
//   generateFundingReport(input)                    → orchestrates the above
//   previewFundingReport(profile, grants, programs) → counts for the free preview
//
// Inputs are the `au_grants` / `au_programs` row shapes from
// @/lib/funding/seed-map (no server-only import here so this file is usable
// from tests, cron and the API route alike). Tax items reuse the CFO helpers
// `estimateRdti()` / `evaluateEsic()` — hence the numeric GrantProfile.
//
// Scoring (0–100): stage fit 30 · industry fit 25 · amount vs need 15 ·
// demographic bonus 10 · timing 20. Hard gates exclude a row entirely with a
// `reason` (see screenGrants / screenPrograms). Colocated tests:
// grant-advisor.test.ts (pins scorer + timeline against the real seeds).

import type { AuGrantRow, AuProgramRow, Capital } from "@/lib/funding/seed-map";
import { capitalForCity } from "@/lib/funding/seed-map";
import {
  estimateRdti,
  evaluateEsic,
  ESIC_INVESTOR_OFFSET_RATE,
  ESIC_SOPHISTICATED_MAX_OFFSET_AUD,
  RDTI_MIN_SPEND_AUD,
  type EsicResult,
  type Points100Signals,
  type PrinciplesSignals,
  type RdtiEstimate,
} from "./cfo-au-tax-incentives";
import {
  AFFILIATION_ANY_KEYS,
  NOT_FOR_FOUNDERS_KEYS,
  SECTOR_GATE_KEYS,
  addDays,
  addMonths,
  affiliationMatches,
  asNumber,
  asString,
  daysBetween,
  demographicGate,
  demographicOverlap,
  effectiveGrantStatus,
  effectiveProgramStatus,
  expandDemographics,
  firstOfMonth,
  formatAud,
  isRollingString,
  overlap,
  parseSeedDate,
  regionIsNational,
  stageAtLeast,
  stageDistance,
  startOfUtcDay,
  toIsoDate,
  toMonthKey,
  utcDay,
  yearsBetween,
  type EffectiveStatus,
  type FounderStage,
} from "./grant-advisor-rules";
import { narrateFundingPlan, type NarrativeInput, type NarrativeResult } from "./grant-advisor-narrative";

export { FOUNDER_STAGES, DEMOGRAPHIC_TAGS, type FounderStage } from "./grant-advisor-rules";
export { narrateFundingPlan } from "./grant-advisor-narrative";
export type { NarrativeResult } from "./grant-advisor-narrative";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ProfileState = "NSW" | "VIC" | "QLD" | "WA" | "SA" | "TAS" | "ACT" | "NT";
export type EntityType = "pty_ltd" | "sole_trader" | "trust" | "partnership";

/**
 * Numeric founder / company profile (mirrors `project_grant_profiles`, plan
 * §4b). Guest reports store the same shape in `funding_reports.intake`.
 * Anything optional that is missing is treated as *unknown* — it never fails a
 * gate, it produces an "unknown" checklist item instead.
 */
export interface GrantProfile {
  state: ProfileState;
  city?: string | null;
  entity_type?: EntityType | null;
  /** ISO date `YYYY-MM-DD`. */
  incorporated_at?: string | null;
  turnover_aud?: number | null;
  prior_year_expenses_aud?: number | null;
  prior_year_income_aud?: number | null;
  rd_spend_aud?: number | null;
  headcount?: number | null;
  /** Taxonomy in DEMOGRAPHIC_TAGS (§5d). */
  founder_demographics?: string[] | null;
  /** Free text, e.g. "UNSW", "Curtin University". */
  university_affiliations?: string[] | null;
  export_intent?: boolean | null;
  listed?: boolean | null;
  prior_raise_aud?: number | null;
  stage: FounderStage;
  /** Taxonomy in §5d industry_tags. */
  industry_tags?: string[] | null;
  funding_need_aud?: number | null;
  description?: string | null;
  /** Optional self-reported ESIC innovation-test signals (100-point / principles). */
  esic_signals?: {
    points?: Partial<Points100Signals>;
    principles?: Partial<PrinciplesSignals>;
  } | null;
}

export interface EligibilityCheck {
  label: string;
  status: "pass" | "fail" | "unknown";
  detail?: string;
}

export type MatchTiming = "open_now" | "rolling" | "opens_soon" | "between_rounds" | "unknown";

export interface ScoreBreakdown {
  stage: number;
  industry: number;
  amount: number;
  demographic: number;
  timing: number;
}

export interface NextWindow {
  kind: "rolling" | "dated" | "estimated" | "unknown";
  opens_at?: string;
  closes_at?: string;
  cohort_start?: string;
  days_until_close?: number;
  label: string;
}

export interface ScoredGrant {
  kind: "grant";
  ref_id: string;
  name: string;
  score: number;
  breakdown: ScoreBreakdown;
  timing: MatchTiming;
  effective_status: Extract<EffectiveStatus, "open" | "upcoming">;
  next_window: NextWindow;
  eligibility_checklist: EligibilityCheck[];
  /** Cash-equivalent estimate where a calculator exists (R&DTI offset, ESIC investor offset). */
  estimate_aud?: number;
  estimate_note?: string;
  why: string[];
  grant: AuGrantRow;
}

export interface ScoredProgram {
  kind: "program";
  ref_id: string;
  name: string;
  score: number;
  breakdown: ScoreBreakdown;
  timing: MatchTiming;
  effective_status: Extract<EffectiveStatus, "open" | "upcoming">;
  next_window: NextWindow;
  eligibility_checklist: EligibilityCheck[];
  why: string[];
  program: AuProgramRow;
}

export interface ExcludedRow {
  ref_id: string;
  name: string;
  reason: string;
}

export interface TimelineItem {
  /** `YYYY-MM` — the month to act. */
  month: string;
  kind: "grant" | "program" | "tax" | "event" | "milestone";
  ref_id: string;
  name: string;
  action: string;
  lead_time_days: number;
  /** ISO date when a hard deadline is known. */
  deadline?: string;
  why: string;
}

export interface FundingPreview {
  grant_count: number;
  program_count: number;
  top_grants: string[];
  top_programs: string[];
  /** Sum of `amount_max_aud` across matched grants (null amounts skipped). */
  total_amount_max_aud: number;
  /** Same sum over the top-5 grants only — the sane "up to A$X" hero number. */
  top_grants_amount_max_aud: number;
  timeline_count: number;
}

export interface FundingReport {
  generated_at: string;
  today: string;
  profile: GrantProfile;
  grants: ScoredGrant[];
  programs: ScoredProgram[];
  excluded: { grants: ExcludedRow[]; programs: ExcludedRow[] };
  timeline: TimelineItem[];
  tax: { rdti?: RdtiEstimate; esic?: EsicResult };
  summary: FundingPreview;
  narrative_md?: string;
  actions?: string[];
  narrative_source?: NarrativeResult["source"];
  disclaimer: string;
}

export interface GenerateFundingReportInput {
  profile: GrantProfile;
  grants: AuGrantRow[];
  programs: AuProgramRow[];
  today?: Date;
  /** Call the LLM for the narrative (default false — the free preview never pays for it). */
  withNarrative?: boolean;
  /** How many of each list to hand the narrative. */
  topN?: number;
}

/** §5f mandatory disclaimer — surfaced verbatim on every report. */
export const FUNDING_DISCLAIMER =
  "General information only — not financial, tax or legal advice. Eligibility is decided solely by each agency; a match is not an approval. Programs pause or close without notice; confirm dates on the official portal before you apply. R&DTI, ESIC and instant asset write-off figures are estimates — confirm with a registered tax agent. Grant income is generally assessable and GST may apply. Equity programs are listed for information and are not an offer or recommendation.";

// ─── Profile normalisation ───────────────────────────────────────────────────

interface NormProfile {
  raw: GrantProfile;
  state: ProfileState;
  capital: Capital;
  city: string | null;
  stage: FounderStage;
  entity: EntityType | null;
  incorporated: Date | null;
  yearsIncorporated: number | null;
  turnover: number | null;
  expenses: number | null;
  income: number | null;
  rdSpend: number | null;
  headcount: number | null;
  demographics: Set<string>;
  affiliations: string[];
  exportIntent: boolean | null;
  listed: boolean | null;
  priorRaise: number | null;
  industries: string[];
  need: number | null;
}

function normaliseProfile(p: GrantProfile, today: Date): NormProfile {
  const incorporated = parseSeedDate(p.incorporated_at ?? null, "start");
  const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    raw: p,
    state: p.state,
    capital: capitalForCity(p.city ?? null, p.state),
    city: asString(p.city),
    stage: p.stage,
    entity: p.entity_type ?? null,
    incorporated,
    yearsIncorporated: incorporated ? Math.max(0, yearsBetween(incorporated, today)) : null,
    turnover: n(p.turnover_aud),
    expenses: n(p.prior_year_expenses_aud),
    income: n(p.prior_year_income_aud),
    rdSpend: n(p.rd_spend_aud),
    headcount: n(p.headcount),
    demographics: expandDemographics(p.founder_demographics),
    affiliations: (p.university_affiliations ?? []).map((s) => String(s)).filter(Boolean),
    exportIntent: typeof p.export_intent === "boolean" ? p.export_intent : null,
    listed: typeof p.listed === "boolean" ? p.listed : null,
    priorRaise: n(p.prior_raise_aud),
    industries: (p.industry_tags ?? []).map((s) => String(s)).filter(Boolean),
    need: n(p.funding_need_aud),
  };
}

function resolveToday(today?: Date): Date {
  return startOfUtcDay(today ?? new Date());
}

// ─── Gate helpers ────────────────────────────────────────────────────────────

type Gate = { check: EligibilityCheck; fail: boolean };

function pass(label: string, detail?: string): Gate {
  return { check: { label, status: "pass", detail }, fail: false };
}
function fail(label: string, detail?: string): Gate {
  return { check: { label, status: "fail", detail }, fail: true };
}
function unknown(label: string, detail?: string): Gate {
  return { check: { label, status: "unknown", detail }, fail: false };
}

function gateMax(label: string, value: number | null, max: number, unit = "A$"): Gate {
  if (value === null) return unknown(label, "not provided");
  const fmt = unit === "A$" ? formatAud : (n: number) => `${n}`;
  return value <= max
    ? pass(label, `${fmt(value)} ≤ ${fmt(max)}`)
    : fail(label, `${fmt(value)} exceeds ${fmt(max)}`);
}

function gateMin(label: string, value: number | null, min: number, unit = "A$"): Gate {
  if (value === null) return unknown(label, "not provided");
  const fmt = unit === "A$" ? formatAud : (n: number) => `${n}`;
  return value >= min
    ? pass(label, `${fmt(value)} ≥ ${fmt(min)}`)
    : fail(label, `${fmt(value)} below ${fmt(min)}`);
}

function gateYearsMax(label: string, years: number | null, max: number): Gate {
  if (years === null) return unknown(label, "incorporation date not provided");
  return years <= max
    ? pass(label, `${years.toFixed(1)} yrs ≤ ${max}`)
    : fail(label, `${years.toFixed(1)} yrs > ${max}`);
}

function gateCompany(p: NormProfile): Gate {
  if (p.entity === null) return unknown("Incorporated company (ACN)", "entity type not provided");
  return p.entity === "pty_ltd"
    ? pass("Incorporated company (ACN)")
    : fail("Incorporated company (ACN)", `${p.entity} is not a company — trusts, sole traders and partnerships are ineligible`);
}

function gateState(p: NormProfile, rowState: string, hq: unknown, label = "HQ state"): Gate {
  const required = asString(hq) ?? (rowState !== "national" ? rowState : null);
  if (!required) return pass(label, "national scheme");
  return required.toUpperCase() === p.state
    ? pass(label, `${p.state} HQ`)
    : fail(label, `requires ${required} HQ (you are in ${p.state})`);
}

function gateDemographic(
  name: string,
  tags: string[],
  elig: Record<string, unknown>,
  p: NormProfile,
  nameHeuristic: boolean,
): Gate {
  const gate = demographicGate(name, tags, elig, nameHeuristic);
  if (!gate.restricted) return pass("Open to all founders");
  const label = `Founder group: ${gate.required.join(" / ")}`;
  return demographicOverlap(gate.required, p.demographics)
    ? pass(label)
    : fail(label, "this program is reserved for founders in that group");
}

function gateSector(elig: Record<string, unknown>, rowIndustries: string[], p: NormProfile): Gate | null {
  const keys = Object.keys(elig).filter((k) => SECTOR_GATE_KEYS.has(k) && elig[k]);
  if (keys.length === 0) return null;
  const label = `Sector fit (${keys.join(", ")})`;
  if (rowIndustries.length === 0 || p.industries.length === 0) return unknown(label, "sector not confirmed");
  const hit = overlap(p.industries, rowIndustries);
  return hit.length > 0 ? pass(label, hit.join(", ")) : fail(label, `needs one of ${rowIndustries.join(", ")}`);
}

// ─── Grants ──────────────────────────────────────────────────────────────────

function grantGates(row: AuGrantRow, p: NormProfile): Gate[] {
  const e = row.eligibility ?? {};
  const gates: Gate[] = [];

  // Geography
  gates.push(gateState(p, row.state, e.hq_required ?? e.hq_or_rd_in));
  const lga = asString(e.lga);
  if (lga) {
    if (!p.city) gates.push(unknown(`Located in ${lga}`, "city not provided"));
    else {
      const lgaCity = lga.replace(/^city of\s+/i, "").toLowerCase();
      gates.push(
        p.city.toLowerCase().includes(lgaCity)
          ? pass(`Located in ${lga}`)
          : fail(`Located in ${lga}`, `you are in ${p.city}`),
      );
    }
  }

  // Applicant type
  for (const k of NOT_FOR_FOUNDERS_KEYS) {
    if (e[k]) gates.push(fail("Applicant type", `${k}: ${String(e[k])}`));
  }
  if (e.is_company_acn || e.au_incorporated) gates.push(gateCompany(p));
  if (e.not_listed) {
    if (p.listed === null) gates.push(unknown("Unlisted company", "not provided"));
    else gates.push(p.listed ? fail("Unlisted company", "listed companies are ineligible") : pass("Unlisted company"));
  }
  if (e.individual && !e.eligible_income_support) {
    gates.push(
      p.entity === null || p.entity === "sole_trader"
        ? pass("Applies as an individual")
        : fail("Applies as an individual", "this is a personal program, not for companies"),
    );
  }

  // Size / age caps
  const turnoverMax = asNumber(e.turnover_max);
  if (turnoverMax !== null) gates.push(gateMax("Turnover cap", p.turnover, turnoverMax));
  const refundableCap = asNumber(e.turnover_max_for_refundable);
  if (refundableCap !== null) gates.push(gateMax("Turnover under the refundable-offset cap", p.turnover, refundableCap));
  const turnoverOpexMax = asNumber(e.turnover_and_opex_max);
  if (turnoverOpexMax !== null) {
    const orYears = asNumber(e.or_trading_years_max);
    const bigTurnover = p.turnover !== null && p.turnover > turnoverOpexMax;
    const bigOpex = p.expenses !== null && p.expenses > turnoverOpexMax;
    const youngEnough = orYears !== null && p.yearsIncorporated !== null && p.yearsIncorporated <= orYears;
    const label = `Turnover & opex under ${formatAud(turnoverOpexMax)}${orYears !== null ? ` (or < ${orYears} yrs trading)` : ""}`;
    if (p.turnover === null && p.expenses === null) gates.push(unknown(label, "not provided"));
    else if (!bigTurnover && !bigOpex) gates.push(pass(label));
    else gates.push(youngEnough ? pass(label, "young-company limb") : fail(label));
  }
  const fteMax = asNumber(e.fte_max);
  if (fteMax !== null) gates.push(gateMax("Headcount cap", p.headcount, fteMax, "n"));
  const incMax = asNumber(e.incorporated_years_max);
  if (incMax !== null) gates.push(gateYearsMax(`Incorporated within ${incMax} yrs`, p.yearsIncorporated, incMax));
  const tradingMax = asNumber(e.trading_years_max);
  if (tradingMax !== null) gates.push(gateYearsMax(`Trading under ${tradingMax} yrs`, p.yearsIncorporated, tradingMax));
  const tradingMin = asNumber(e.trading_years_min);
  if (tradingMin !== null) {
    gates.push(
      p.yearsIncorporated === null
        ? unknown(`Trading ≥ ${tradingMin} yrs`, "incorporation date not provided")
        : p.yearsIncorporated >= tradingMin
          ? pass(`Trading ≥ ${tradingMin} yrs`)
          : fail(`Trading ≥ ${tradingMin} yrs`, `${p.yearsIncorporated.toFixed(1)} yrs`),
    );
  }
  const rdMin = asNumber(e.rd_spend_min);
  if (rdMin !== null) gates.push(gateMin("Eligible R&D spend", p.rdSpend, rdMin));
  const raiseMax = asNumber(e.prior_raise_max);
  if (raiseMax !== null) gates.push(gateMax("Prior capital raised cap", p.priorRaise, raiseMax));
  const expMax = asNumber(e.prior_year_expenses_max);
  if (expMax !== null) gates.push(gateMax("Prior-year expenses cap", p.expenses, expMax));
  const incomeMax = asNumber(e.prior_year_income_max);
  if (incomeMax !== null) gates.push(gateMax("Prior-year assessable income cap", p.income, incomeMax));

  // Stage-implied product / revenue gates
  if (e.mvp_or_beyond || e.has_product) {
    gates.push(stageAtLeast(p.stage, "mvp") ? pass("Has an MVP / product") : fail("Has an MVP / product", `stage is ${p.stage}`));
  }
  if (e.has_revenue) {
    const revenue = (p.turnover !== null && p.turnover > 0) || stageAtLeast(p.stage, "early_revenue");
    gates.push(revenue ? pass("Has revenue") : fail("Has revenue", "pre-revenue"));
  }
  if (e.export_intent || e.has_export_contract || e.export_spend_capacity_min) {
    const label = e.has_export_contract ? "Export contract in hand" : "Export intent";
    if (p.exportIntent === null) gates.push(unknown(label, "not provided"));
    else if (!p.exportIntent) gates.push(fail(label, "no export intent recorded"));
    else gates.push(e.has_export_contract ? unknown(label, "confirm a signed export contract") : pass(label));
  }

  // Sector + demographic
  const sector = gateSector(e, row.industry_tags ?? [], p);
  if (sector) gates.push(sector);
  gates.push(gateDemographic(row.name, row.demographic_tags ?? [], e, p, true));

  // Soft (never fail) — surfaced so the founder knows what to evidence
  if (e.requires_research_partner) gates.push(unknown("Research partner (university / CSIRO) lined up"));
  if (e.requires_investor_lead || e.has_lead_investor) gates.push(unknown("Lead investor committed"));
  if (e.owns_ip) gates.push(unknown("Owns or controls the IP"));
  if (e.gst_registered) gates.push(unknown("GST registered"));
  if (e.has_abn) gates.push(unknown("Has an ABN"));
  if (e.responds_to_challenge) gates.push(unknown("Responds to a current challenge call"));

  // Stage window: adjacent stages score half; two or more away is noise, not an option.
  const dist = stageDistance(p.stage, row.stage_tags ?? []);
  if (dist !== null && dist >= 2) gates.push(fail("Stage fit", `targets ${row.stage_tags.join(", ")}`));

  return gates;
}

function grantWindow(row: AuGrantRow, status: EffectiveStatus, today: Date): { timing: MatchTiming; next_window: NextWindow } {
  const win = (row.application_window ?? "").toLowerCase();
  const opens = parseSeedDate(row.opens_at, "start");
  const closes = parseSeedDate(row.closes_at, "end");
  const closesFuture = closes !== null && daysBetween(today, closes) >= 0;
  const opensFuture = opens !== null && daysBetween(today, opens) > 0;

  if (status === "open") {
    if (win === "rolling") {
      return { timing: "rolling", next_window: { kind: "rolling", label: "Rolling — apply any time" } };
    }
    if (closesFuture && !opensFuture) {
      return {
        timing: "open_now",
        next_window: {
          kind: "dated",
          opens_at: opens ? toIsoDate(opens) : undefined,
          closes_at: toIsoDate(closes),
          days_until_close: daysBetween(today, closes),
          label: `Open now — closes ${toIsoDate(closes)}`,
        },
      };
    }
    if (opensFuture) {
      const days = daysBetween(today, opens);
      return {
        timing: days <= 90 ? "opens_soon" : "unknown",
        next_window: { kind: "dated", opens_at: toIsoDate(opens), closes_at: closes ? toIsoDate(closes) : undefined, label: `Opens ${toIsoDate(opens)}` },
      };
    }
    if (!closes) {
      // Status says open with no dated round → treat as continuously open.
      return { timing: "rolling", next_window: { kind: "rolling", label: "Open — no fixed close date published" } };
    }
    return { timing: "unknown", next_window: { kind: "unknown", label: "Status open but last published round has closed — verify" } };
  }

  // upcoming (incl. between rounds)
  if (opensFuture) {
    const days = daysBetween(today, opens);
    return {
      timing: days <= 90 ? "opens_soon" : "unknown",
      next_window: { kind: "dated", opens_at: toIsoDate(opens), closes_at: closes ? toIsoDate(closes) : undefined, label: `Opens ${toIsoDate(opens)}` },
    };
  }
  if (opens && closes && closesFuture) {
    // Announced window already open although status is still "upcoming".
    return {
      timing: "open_now",
      next_window: { kind: "dated", opens_at: toIsoDate(opens), closes_at: toIsoDate(closes), days_until_close: daysBetween(today, closes), label: `Open now — closes ${toIsoDate(closes)}` },
    };
  }
  if (row.status === "closed") {
    // Between rounds: estimate next window for annual rounds from last year's dates.
    if ((win === "annual_round" || win === "annual") && opens && closes) {
      const nextOpen = addMonths(opens, 12);
      const nextClose = addMonths(closes, 12);
      if (daysBetween(today, nextClose) >= 0) {
        return {
          timing: "between_rounds",
          next_window: {
            kind: "estimated",
            opens_at: toIsoDate(nextOpen),
            closes_at: toIsoDate(nextClose),
            label: `Between rounds — next round expected ~${toMonthKey(nextOpen)} (based on last year)`,
          },
        };
      }
    }
    return {
      timing: "between_rounds",
      next_window: { kind: "unknown", label: row.next_round_note ? `Between rounds — ${row.next_round_note}` : "Between rounds — next round not yet announced" },
    };
  }
  return {
    timing: "unknown",
    next_window: { kind: "unknown", label: row.next_round_note ?? "Announced — dates not yet published" },
  };
}

const TIMING_SCORE: Record<MatchTiming, number> = {
  open_now: 20,
  rolling: 16,
  opens_soon: 12,
  unknown: 8,
  between_rounds: 6,
};

function stageScore(stage: FounderStage, tags: string[]): number {
  const d = stageDistance(stage, tags);
  if (d === null) return 15;
  if (d === 0) return 30;
  if (d === 1) return 15;
  return 0;
}

function industryScore(
  profileTags: string[],
  rowTags: string[],
  elig: Record<string, unknown>,
): { score: number; hit: string[] } {
  const sectorGated = Object.keys(elig).some((k) => SECTOR_GATE_KEYS.has(k) && elig[k]);
  if (rowTags.length === 0) return { score: 15, hit: [] };
  // Founder gave no industry: neutral, but a sector-locked row cannot be assumed to fit.
  if (profileTags.length === 0) return { score: sectorGated ? 8 : 15, hit: [] };
  const hit = overlap(profileTags, rowTags);
  return { score: hit.length > 0 ? 25 : 5, hit };
}

function amountScore(need: number | null, max: number | null): number {
  if (need === null || need <= 0 || max === null || max <= 0) return 8;
  const ratio = max / need;
  if (ratio >= 1) return 15;
  if (ratio >= 0.5) return 12;
  if (ratio >= 0.25) return 8;
  if (ratio >= 0.1) return 4;
  return 2;
}

function demographicScore(rowTags: string[], founder: Set<string>): number {
  if (rowTags.length === 0 || founder.size === 0) return 0;
  return rowTags.some((t) => founder.has(t)) ? 10 : 0;
}

interface TaxEstimate {
  estimate_aud?: number;
  note?: string;
  checks: EligibilityCheck[];
  rdti?: RdtiEstimate;
  esic?: EsicResult;
}

function rdtiFor(p: NormProfile): TaxEstimate {
  if (p.turnover === null || p.rdSpend === null) {
    return {
      checks: [{ label: "R&DTI estimate", status: "unknown", detail: "needs turnover and eligible R&D spend" }],
    };
  }
  const est = estimateRdti({ aggregatedTurnoverAud: p.turnover, eligibleRdExpenditureAud: p.rdSpend });
  return {
    estimate_aud: est.eligible ? est.estimatedOffsetAud : undefined,
    note: est.eligible
      ? `${Math.round(est.offsetRate * 1000) / 10}% ${est.tier} offset on ${formatAud(p.rdSpend)} eligible R&D`
      : est.notes[0],
    checks: [
      {
        label: `R&D spend ≥ ${formatAud(RDTI_MIN_SPEND_AUD)}`,
        status: est.eligible ? "pass" : "fail",
        detail: est.notes[0],
      },
    ],
    rdti: est,
  };
}

function esicFor(p: NormProfile): TaxEstimate {
  if (p.yearsIncorporated === null || p.expenses === null || p.income === null) {
    return {
      checks: [
        { label: "ESIC early-stage test", status: "unknown", detail: "needs incorporation date, prior-year expenses and income" },
      ],
    };
  }
  const res = evaluateEsic({
    yearsSinceIncorporation: Math.floor(p.yearsIncorporated),
    cumulativePriorYearExpensesAud: p.expenses,
    priorYearAssessableIncomeAud: p.income,
    priorYearTotalExpensesAud: p.expenses,
    listedOnExchange: p.listed === true,
    points: p.raw.esic_signals?.points,
    principles: p.raw.esic_signals?.principles,
  });
  const checks: EligibilityCheck[] = [
    { label: "ESIC early-stage test", status: res.earlyStage.passes ? "pass" : "fail", detail: res.earlyStage.reasoning.join(" ") },
    {
      label: "ESIC innovation test (100-point or principles)",
      status: p.raw.esic_signals ? (res.innovation.passes ? "pass" : "fail") : "unknown",
      detail: res.innovation.reasoning[0],
    },
  ];
  let estimate: number | undefined;
  let note: string | undefined;
  if (res.earlyStage.passes && p.need !== null && p.need > 0) {
    const investable = Math.min(p.need, ESIC_SOPHISTICATED_MAX_OFFSET_AUD / ESIC_INVESTOR_OFFSET_RATE);
    estimate = Math.round(investable * ESIC_INVESTOR_OFFSET_RATE);
    note = `Investors in a ${formatAud(p.need)} raise could claim up to ${formatAud(estimate)} in 20% ESIC offsets (dilution reducer)`;
  }
  return { estimate_aud: estimate, note, checks, esic: res };
}

/** Screen + score grants; returns matches and the rows excluded with a reason. */
export function screenGrants(
  profile: GrantProfile,
  grants: AuGrantRow[],
  today?: Date,
): { matched: ScoredGrant[]; excluded: ExcludedRow[]; tax: { rdti?: RdtiEstimate; esic?: EsicResult } } {
  const now = resolveToday(today);
  const p = normaliseProfile(profile, now);
  const matched: ScoredGrant[] = [];
  const excluded: ExcludedRow[] = [];
  const tax: { rdti?: RdtiEstimate; esic?: EsicResult } = {};

  for (const row of grants) {
    if (row.exclude_from_matching || row.name === "__data_sources__") {
      excluded.push({ ref_id: row.id, name: row.name, reason: "exclude_from_matching" });
      continue;
    }
    const status = effectiveGrantStatus(row, now);
    if (status === "paused" || status === "closed") {
      excluded.push({ ref_id: row.id, name: row.name, reason: `status ${row.status}${row.application_window ? ` (${row.application_window})` : ""}` });
      continue;
    }

    const gates = grantGates(row, p);
    let estimate: TaxEstimate | null = null;
    if (row.id === "rdti") estimate = rdtiFor(p);
    if (row.id === "esic") estimate = esicFor(p);
    if (estimate) {
      gates.push(...estimate.checks.map((check) => ({ check, fail: check.status === "fail" })));
      if (estimate.rdti) tax.rdti = estimate.rdti;
      if (estimate.esic) tax.esic = estimate.esic;
    }

    const failed = gates.filter((g) => g.fail);
    if (failed.length > 0) {
      excluded.push({
        ref_id: row.id,
        name: row.name,
        reason: failed.map((g) => `${g.check.label}${g.check.detail ? ` — ${g.check.detail}` : ""}`).join("; "),
      });
      continue;
    }

    const { timing, next_window } = grantWindow(row, status, now);
    const stage = stageScore(p.stage, row.stage_tags ?? []);
    const ind = industryScore(p.industries, row.industry_tags ?? [], row.eligibility ?? {});
    const amount = amountScore(p.need, row.amount_max_aud);
    const demo = demographicScore(row.demographic_tags ?? [], p.demographics);
    const breakdown: ScoreBreakdown = { stage, industry: ind.score, amount, demographic: demo, timing: TIMING_SCORE[timing] };
    const score = stage + ind.score + amount + demo + breakdown.timing;

    const why: string[] = [];
    if (stage === 30) why.push(`targets your ${p.stage.replace(/_/g, " ")} stage`);
    if (ind.hit.length) why.push(`sector fit: ${ind.hit.join(", ")}`);
    if (demo) why.push("priority stream for your founder group");
    if (row.amount_max_aud) why.push(`up to ${formatAud(row.amount_max_aud)}${row.co_contribution && row.co_contribution !== "none" ? ` (co-contribution ${row.co_contribution})` : ""}`);
    why.push(next_window.label);

    matched.push({
      kind: "grant",
      ref_id: row.id,
      name: row.name,
      score,
      breakdown,
      timing,
      effective_status: status,
      next_window,
      eligibility_checklist: gates.map((g) => g.check),
      estimate_aud: estimate?.estimate_aud,
      estimate_note: estimate?.note,
      why,
      grant: row,
    });
  }

  matched.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { matched, excluded, tax };
}

/** Pure: hard-gate then score grants for a founder profile, sorted by score desc. */
export function matchGrants(profile: GrantProfile, grants: AuGrantRow[], today?: Date): ScoredGrant[] {
  return screenGrants(profile, grants, today).matched;
}

// ─── Programs ────────────────────────────────────────────────────────────────

function programGates(row: AuProgramRow, p: NormProfile): Gate[] {
  const e = row.eligibility ?? {};
  const gates: Gate[] = [];

  // Geography: in-person programs need the founder in the same capital region
  // unless the program is remote / national / explicitly Australia-wide.
  const hq = asString(e.hq_required);
  if (hq) {
    gates.push(hq.toUpperCase() === p.state ? pass("HQ state", `${p.state}`) : fail("HQ state", `requires ${hq} HQ`));
  }
  const national = row.capital === "Remote" || row.state === "national" || regionIsNational(e.region);
  if (national) gates.push(pass("Location", "remote / Australia-wide"));
  else if (row.capital === p.capital) gates.push(pass("Location", `${row.city} — your region`));
  else gates.push(fail("Location", `in-person in ${row.city}; you are near ${p.capital}`));

  // Applicant type
  for (const k of NOT_FOR_FOUNDERS_KEYS) {
    if (e[k]) gates.push(fail("Applicant type", `${k}: ${String(e[k])}`));
  }

  // Affiliation
  const affiliation = e.university_affiliation ?? e.university_entry;
  if (asString(affiliation)) {
    gates.push(
      affiliationMatches(affiliation, p.affiliations)
        ? pass(`Affiliation: ${asString(affiliation)}`)
        : fail(`Affiliation: ${asString(affiliation)}`, "no matching university affiliation on your profile"),
    );
  }
  for (const k of AFFILIATION_ANY_KEYS) {
    if (e[k]) {
      gates.push(
        p.affiliations.length > 0
          ? pass("University / research affiliation")
          : fail("University / research affiliation", `${k} required`),
      );
    }
  }

  // Size / age / traction
  const revenueMax = asNumber(e.revenue_max);
  if (revenueMax !== null) gates.push(gateMax("Revenue cap", p.turnover, revenueMax));
  const ageMax = asNumber(e.startup_age_max_years) ?? asNumber(e.company_age_max_years);
  if (ageMax !== null) gates.push(gateYearsMax(`Company younger than ${ageMax} yrs`, p.yearsIncorporated, ageMax));
  if (e.traction_required || e.has_revenue || e.customer_validated) {
    const ok = stageAtLeast(p.stage, "early_revenue") || (p.turnover !== null && p.turnover > 0) || (e.customer_validated && stageAtLeast(p.stage, "mvp"));
    gates.push(ok ? pass("Traction / revenue") : fail("Traction / revenue", `stage is ${p.stage}`));
  }
  if (e.scaleup || e.one_of || e.revenue_range_aud || e.growth_3yr_min_pct) {
    gates.push(stageAtLeast(p.stage, "scaling") ? pass("Scale-up stage") : fail("Scale-up stage", `stage is ${p.stage}`));
  }
  if (e.export_intent) {
    if (p.exportIntent === null) gates.push(unknown("Export intent", "not provided"));
    else gates.push(p.exportIntent ? pass("Export intent") : fail("Export intent", "no export intent recorded"));
  }
  if (e.rdti_eligible) {
    gates.push(
      p.rdSpend === null
        ? unknown("R&DTI-eligible spend", "not provided")
        : p.rdSpend >= RDTI_MIN_SPEND_AUD
          ? pass("R&DTI-eligible spend")
          : fail("R&DTI-eligible spend", `${formatAud(p.rdSpend)} below ${formatAud(RDTI_MIN_SPEND_AUD)}`),
    );
  }
  if (e.us_operations_required || e.parent_entity) gates.push(unknown("Foreign parent / US operations", String(e.parent_entity ?? "required")));
  if (e.full_time_founders) gates.push(unknown("Founders full-time"));
  if (e.prerequisite) gates.push(unknown(`Prerequisite: ${String(e.prerequisite)}`));
  if (e.ignite_ideas_recipient_or_selected) gates.push(unknown("Ignite Ideas recipient"));

  // Sector + demographic
  const sector = gateSector(e, row.industry_tags ?? [], p);
  if (sector) gates.push(sector);
  gates.push(gateDemographic(row.name, row.demographic_tags ?? [], e, p, true));

  // Stage overlap (adjacent stage allowed at half score; further → out)
  const dist = stageDistance(p.stage, row.stage_tags ?? []);
  if (dist !== null && dist >= 2) gates.push(fail("Stage fit", `targets ${row.stage_tags.join(", ")}`));

  return gates;
}

/** Derive the next application window for a program relative to `today`. */
export function programNextWindow(row: AuProgramRow, today: Date): { timing: MatchTiming; next_window: NextWindow } {
  const opens = parseSeedDate(row.applications_open, "start");
  const closes = parseSeedDate(row.applications_close, "end");
  const cohort = parseSeedDate(row.next_cohort_start, "start");
  const rolling = isRollingString(row.applications_open) || isRollingString(row.applications_close);

  // Events have a date, not an application window.
  if (row.program_type === "event") {
    const next = cohort && daysBetween(today, cohort) >= 0 ? cohort : nextIntakeStart(row.intake_months ?? [], today);
    if (next) {
      const d = daysBetween(today, next);
      return {
        timing: d <= 120 ? "opens_soon" : "unknown",
        next_window: { kind: "dated", cohort_start: toIsoDate(next), label: `Next edition ~${toIsoDate(next)}` },
      };
    }
    return { timing: "unknown", next_window: { kind: "unknown", label: "Next edition not yet announced" } };
  }

  if (closes && daysBetween(today, closes) >= 0) {
    const openNow = !opens || daysBetween(today, opens) <= 0;
    const daysToOpen = opens ? daysBetween(today, opens) : 0;
    const window: NextWindow = {
      kind: "dated",
      opens_at: opens ? toIsoDate(opens) : undefined,
      closes_at: toIsoDate(closes),
      cohort_start: cohort ? toIsoDate(cohort) : undefined,
      days_until_close: daysBetween(today, closes),
      label:
        openNow || !opens
          ? `Applications open — close ${toIsoDate(closes)}`
          : `Applications open ${toIsoDate(opens)} — close ${toIsoDate(closes)}`,
    };
    return { timing: openNow ? "open_now" : daysToOpen <= 90 ? "opens_soon" : "between_rounds", next_window: window };
  }
  if (opens && daysBetween(today, opens) > 0) {
    const d = daysBetween(today, opens);
    return {
      timing: d <= 90 ? "opens_soon" : "between_rounds",
      next_window: { kind: "dated", opens_at: toIsoDate(opens), cohort_start: cohort ? toIsoDate(cohort) : undefined, label: `Applications open ${toIsoDate(opens)}` },
    };
  }
  if (rolling && row.status === "open") {
    return { timing: "rolling", next_window: { kind: "rolling", cohort_start: cohort ? toIsoDate(cohort) : undefined, label: "Rolling — apply any time" } };
  }
  // Estimate from cohort start or intake months.
  const nextCohort = cohort && daysBetween(today, cohort) >= 0 ? cohort : nextIntakeStart(row.intake_months ?? [], today);
  if (nextCohort) {
    const estClose = addDays(nextCohort, -45);
    const estOpen = addDays(nextCohort, -120);
    const d = daysBetween(today, estOpen);
    return {
      timing: d <= 0 && daysBetween(today, estClose) >= 0 ? "open_now" : d <= 90 ? "opens_soon" : "between_rounds",
      next_window: {
        kind: "estimated",
        opens_at: toIsoDate(estOpen),
        closes_at: toIsoDate(estClose),
        cohort_start: toIsoDate(nextCohort),
        label: `Next cohort ~${toMonthKey(nextCohort)} — apply ~${toMonthKey(estOpen)} to ${toMonthKey(estClose)} (estimated)`,
      },
    };
  }
  if (row.status === "open") {
    return { timing: "rolling", next_window: { kind: "rolling", label: "Open — no fixed intake published" } };
  }
  return { timing: "unknown", next_window: { kind: "unknown", label: "Dates not yet announced" } };
}

function nextIntakeStart(months: number[], today: Date): Date | null {
  const valid = months.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
  if (valid.length === 0) return null;
  const y = today.getUTCFullYear();
  const candidates = valid.flatMap((m) => [utcDay(y, m, 1), utcDay(y + 1, m, 1)]);
  const future = candidates.filter((d) => daysBetween(today, d) >= 0).sort((a, b) => a.getTime() - b.getTime());
  return future[0] ?? null;
}

/** Screen + score programs; returns matches and the rows excluded with a reason. */
export function screenPrograms(
  profile: GrantProfile,
  programs: AuProgramRow[],
  today?: Date,
): { matched: ScoredProgram[]; excluded: ExcludedRow[] } {
  const now = resolveToday(today);
  const p = normaliseProfile(profile, now);
  const matched: ScoredProgram[] = [];
  const excluded: ExcludedRow[] = [];

  for (const row of programs) {
    const status = effectiveProgramStatus(row, now);
    if (status === "paused" || status === "closed") {
      excluded.push({ ref_id: row.id, name: row.name, reason: `status ${row.status}` });
      continue;
    }
    const gates = programGates(row, p);
    const failed = gates.filter((g) => g.fail);
    if (failed.length > 0) {
      excluded.push({
        ref_id: row.id,
        name: row.name,
        reason: failed.map((g) => `${g.check.label}${g.check.detail ? ` — ${g.check.detail}` : ""}`).join("; "),
      });
      continue;
    }

    const { timing, next_window } = programNextWindow(row, now);
    const stage = stageScore(p.stage, row.stage_tags ?? []);
    const ind = industryScore(p.industries, row.industry_tags ?? [], row.eligibility ?? {});
    const amount = amountScore(p.need, row.funding_aud);
    const demo = demographicScore(row.demographic_tags ?? [], p.demographics);
    const breakdown: ScoreBreakdown = { stage, industry: ind.score, amount, demographic: demo, timing: TIMING_SCORE[timing] };
    const score = stage + ind.score + amount + demo + breakdown.timing;

    const why: string[] = [];
    if (stage === 30) why.push(`built for ${p.stage.replace(/_/g, " ")} founders`);
    if (ind.hit.length) why.push(`sector fit: ${ind.hit.join(", ")}`);
    if (demo) why.push("priority for your founder group");
    if (row.funding_aud) why.push(`${formatAud(row.funding_aud)}${row.equity_pct ? ` for ${row.equity_pct}` : " equity-free"}`);
    if (row.capital === "Remote") why.push("remote / Australia-wide");
    why.push(next_window.label);

    matched.push({
      kind: "program",
      ref_id: row.id,
      name: row.name,
      score,
      breakdown,
      timing,
      effective_status: status,
      next_window,
      eligibility_checklist: gates.map((g) => g.check),
      why,
      program: row,
    });
  }

  matched.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { matched: collapseDuplicatePrograms(matched, p.capital, excluded), excluded };
}

/**
 * The seed lists Australia-wide programs once per anchor city (Startmate
 * Sydney + Melbourne, Antler Sydney + Brisbane …). Keep the row in the
 * founder's own capital, else the best-scoring one; the rest go to `excluded`.
 */
function collapseDuplicatePrograms(rows: ScoredProgram[], capital: Capital, excluded: ExcludedRow[]): ScoredProgram[] {
  const key = (r: ScoredProgram) =>
    `${r.program.operator ?? ""}|${r.name.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim().toLowerCase()}`;
  const keep = new Map<string, ScoredProgram>();
  for (const r of rows) {
    const k = key(r);
    const cur = keep.get(k);
    if (!cur) {
      keep.set(k, r);
      continue;
    }
    const preferNew = r.program.capital === capital && cur.program.capital !== capital;
    const winner = preferNew ? r : cur;
    const loser = preferNew ? cur : r;
    keep.set(k, winner);
    excluded.push({ ref_id: loser.ref_id, name: loser.name, reason: `duplicate of ${winner.ref_id}` });
  }
  const kept = new Set([...keep.values()].map((r) => r.ref_id));
  return rows.filter((r) => kept.has(r.ref_id));
}

/** Pure: hard-gate then score programs for a founder profile, sorted by score desc. */
export function matchPrograms(profile: GrantProfile, programs: AuProgramRow[], today?: Date): ScoredProgram[] {
  return screenPrograms(profile, programs, today).matched;
}

// ─── Timeline (§6f) ──────────────────────────────────────────────────────────

const GRANT_LEAD_DAYS = 75;
const ACCELERATOR_LEAD_DAYS = 90;
const LIGHT_LEAD_DAYS = 30;
const TAX_LEAD_DAYS = 60;

type StageBucket = "idea" | "mvp" | "early_revenue" | "scaling";

function stageBucket(stage: FounderStage): StageBucket {
  if (stage === "idea") return "idea";
  if (stage === "pre_revenue_prototype" || stage === "mvp") return "mvp";
  if (stage === "early_revenue") return "early_revenue";
  return "scaling";
}

/**
 * Month offset (from today) at which each program type enters the plan for a
 * stage bucket — the §6f sequencing. `null` = leave it off the timeline.
 */
const PROGRAM_OFFSETS: Record<StageBucket, Partial<Record<string, number | null>>> = {
  idea: {
    community: 0,
    pre_accelerator: 0,
    corporate: 0,
    government: 0,
    advisory: 0,
    incubator: 1,
    university: 1,
    event: 1,
    competition: 3,
    accelerator: 3,
    angel_group: null,
    vc: null,
    rd_advance_loan: null,
  },
  mvp: {
    corporate: 0,
    community: 0,
    university: 0,
    incubator: 0,
    pre_accelerator: 0,
    government: 1,
    accelerator: 1,
    competition: 2,
    event: 2,
    advisory: 3,
    rd_advance_loan: 4,
    angel_group: 5,
    vc: 7,
  },
  early_revenue: {
    corporate: 0,
    accelerator: 0,
    incubator: 0,
    community: 0,
    university: 0,
    government: 1,
    competition: 1,
    event: 1,
    advisory: 1,
    rd_advance_loan: 2,
    angel_group: 3,
    vc: 5,
    pre_accelerator: null,
  },
  scaling: {
    incubator: 0,
    corporate: 0,
    government: 1,
    advisory: 1,
    rd_advance_loan: 1,
    vc: 2,
    accelerator: 2,
    community: 2,
    event: 2,
    competition: 3,
    angel_group: 3,
    university: null,
    pre_accelerator: null,
  },
};

/** Grant kinds enter at 0–2 months depending on stage (state grants stack in parallel at MVP). */
function grantOffset(bucket: StageBucket, row: AuGrantRow): number | null {
  const ft = row.funding_type;
  if (bucket === "idea") {
    if (ft === "advisory_service" || ft === "wage_subsidy") return 0;
    if (ft === "tax_offset_refundable" || ft === "tax_offset_nonrefundable") return null; // handled by tax items
    return 2;
  }
  if (bucket === "mvp") {
    if (ft === "tax_offset_refundable" || ft === "tax_offset_nonrefundable") return null;
    if (ft === "equity" || ft === "co_investment" || ft === "loan_unsecured" || ft === "loan_concessional") return 4;
    return 1;
  }
  if (bucket === "early_revenue") {
    if (ft === "tax_offset_refundable" || ft === "tax_offset_nonrefundable") return null;
    if (ft === "equity" || ft === "co_investment") return 3;
    return 1;
  }
  if (ft === "tax_offset_refundable" || ft === "tax_offset_nonrefundable") return null;
  return 1;
}

function leadDaysForProgram(type: string): number {
  if (type === "accelerator" || type === "university" || type === "vc") return ACCELERATOR_LEAD_DAYS;
  if (type === "angel_group") return 60;
  return LIGHT_LEAD_DAYS;
}

function clampMonth(d: Date, today: Date, end: Date): Date | null {
  if (daysBetween(today, d) < 0) return firstOfMonth(today);
  if (daysBetween(end, d) > 0) return null;
  return firstOfMonth(d);
}

/**
 * R&DTI registration is due 10 months after the income-year end (30 Apr for
 * June balancers). Returns the next 30 Apr strictly after `today`.
 */
export function nextRdtiRegistrationDeadline(today: Date): Date {
  const y = today.getUTCFullYear();
  const thisYear = utcDay(y, 4, 30);
  return daysBetween(today, thisYear) > 0 ? thisYear : utcDay(y + 1, 4, 30);
}

/** ESIC annual report to the ATO — 31 Jul each year. */
export function nextEsicReportDeadline(today: Date): Date {
  const y = today.getUTCFullYear();
  const thisYear = utcDay(y, 7, 31);
  return daysBetween(today, thisYear) > 0 ? thisYear : utcDay(y + 1, 7, 31);
}

/**
 * Pure: a 12-month action timeline (today → +11 months) ordered by month,
 * then by priority (community/pre-accel first at idea stage, etc.). Only
 * effective-open / upcoming rows appear — `status=closed` (permanently) rows
 * never do because match* already dropped them.
 */
export function buildTimeline(
  profile: GrantProfile,
  grants: ScoredGrant[],
  programs: ScoredProgram[],
  today?: Date,
): TimelineItem[] {
  const now = resolveToday(today);
  const p = normaliseProfile(profile, now);
  const bucket = stageBucket(p.stage);
  const end = addDays(addMonths(firstOfMonth(now), 12), -1);
  const items: Array<TimelineItem & { _order: number }> = [];

  // Programs
  for (const sp of programs) {
    const row = sp.program;
    const offset = PROGRAM_OFFSETS[bucket][row.program_type];
    if (offset === null) continue;
    const lead = leadDaysForProgram(row.program_type);
    const w = sp.next_window;
    const close = parseSeedDate(w.closes_at, "start");
    const open = parseSeedDate(w.opens_at, "start");
    const cohort = parseSeedDate(w.cohort_start, "start");
    let when: Date | null;
    let deadline: string | undefined;
    if (row.program_type === "event" && cohort) {
      when = clampMonth(cohort, now, end);
    } else if (close) {
      when = clampMonth(addDays(close, -lead), now, end);
      deadline = w.kind === "dated" ? w.closes_at : undefined;
    } else if (open) {
      when = clampMonth(open, now, end);
    } else if (cohort) {
      when = clampMonth(addDays(cohort, -lead), now, end);
    } else {
      when = addMonths(firstOfMonth(now), offset ?? 0);
    }
    // Investor conversations are sequenced by readiness, not by a portal
    // deadline: angels land 2–4 months after the accelerator step (§6f).
    if (when && (row.program_type === "angel_group" || row.program_type === "vc")) {
      const floor = addMonths(firstOfMonth(now), offset ?? 0);
      if (daysBetween(when, floor) > 0) when = floor;
    }
    if (!when || daysBetween(end, when) > 0) continue;
    const kind: TimelineItem["kind"] = row.program_type === "event" ? "event" : "program";
    items.push({
      month: toMonthKey(when),
      kind,
      ref_id: sp.ref_id,
      name: sp.name,
      action: programAction(row, w),
      lead_time_days: lead,
      deadline,
      why: `${sp.why[0] ?? "matched"} · score ${sp.score}`,
      _order: programOrder(bucket, row.program_type),
    });
  }

  // Grants (tax offsets are timeline'd as tax items below)
  for (const sg of grants) {
    const row = sg.grant;
    const offset = grantOffset(bucket, row);
    if (offset === null) continue;
    const w = sg.next_window;
    const close = parseSeedDate(w.closes_at, "start");
    const open = parseSeedDate(w.opens_at, "start");
    let when: Date | null;
    let deadline: string | undefined;
    if (close) {
      when = clampMonth(addDays(close, -GRANT_LEAD_DAYS), now, end);
      deadline = w.kind === "dated" ? w.closes_at : undefined;
    } else if (open) {
      when = clampMonth(open, now, end);
    } else {
      when = addMonths(firstOfMonth(now), offset);
    }
    if (!when || daysBetween(end, when) > 0) continue;
    items.push({
      month: toMonthKey(when),
      kind: "grant",
      ref_id: sg.ref_id,
      name: sg.name,
      action: grantAction(row, sg),
      lead_time_days: GRANT_LEAD_DAYS,
      deadline,
      why: `${sg.why[0] ?? "matched"} · score ${sg.score}`,
      _order: sg.timing === "between_rounds" ? 60 : 40,
    });
  }

  // Tax items — always considered, independent of the matched lists.
  if (p.rdSpend !== null && p.rdSpend > 0) {
    const due = nextRdtiRegistrationDeadline(now);
    const when = clampMonth(addDays(due, -TAX_LEAD_DAYS), now, end);
    if (when) {
      const est = p.turnover !== null ? estimateRdti({ aggregatedTurnoverAud: p.turnover, eligibleRdExpenditureAud: p.rdSpend }) : null;
      items.push({
        month: toMonthKey(when),
        kind: "tax",
        ref_id: "rdti",
        name: "R&D Tax Incentive registration",
        action: `Register R&D activities with AusIndustry by ${toIsoDate(due)} (10 months after FY end), then claim in the company tax return.`,
        lead_time_days: TAX_LEAD_DAYS,
        deadline: toIsoDate(due),
        why: est?.eligible
          ? `${formatAud(p.rdSpend)} R&D spend → est. ${formatAud(est.estimatedOffsetAud)} ${est.tier} offset`
          : `${formatAud(p.rdSpend)} R&D spend recorded — confirm it clears the ${formatAud(RDTI_MIN_SPEND_AUD)} minimum`,
        _order: 20,
      });
    }
  }
  const esic = esicFor(p);
  if (esic.esic?.earlyStage.passes) {
    const due = nextEsicReportDeadline(now);
    const when = clampMonth(addDays(due, -TAX_LEAD_DAYS), now, end);
    if (when) {
      items.push({
        month: toMonthKey(when),
        kind: "tax",
        ref_id: "esic",
        name: "ESIC annual report",
        action: `Lodge the ESIC report with the ATO by ${toIsoDate(due)} for any shares issued to investors in the year; confirm the innovation test with your tax agent first.`,
        lead_time_days: TAX_LEAD_DAYS,
        deadline: toIsoDate(due),
        why: esic.esic.qualifies ? "profile passes both ESIC limbs" : "early-stage limb passes — innovation test still to confirm",
        _order: 25,
      });
    }
  }

  // Milestones per stage (one anchor per bucket so the plan reads as a journey)
  const milestone = stageMilestone(bucket, now);
  if (milestone) items.push({ ...milestone, _order: 90 });

  items.sort((a, b) => a.month.localeCompare(b.month) || a._order - b._order || a.name.localeCompare(b.name));
  return items.map((item) => {
    const out: TimelineItem = {
      month: item.month,
      kind: item.kind,
      ref_id: item.ref_id,
      name: item.name,
      action: item.action,
      lead_time_days: item.lead_time_days,
      why: item.why,
    };
    if (item.deadline) out.deadline = item.deadline;
    return out;
  });
}

function programOrder(bucket: StageBucket, type: string): number {
  const base: Record<string, number> = {
    community: 10,
    pre_accelerator: 11,
    corporate: 12,
    government: 13,
    advisory: 14,
    incubator: 20,
    university: 21,
    accelerator: 30,
    competition: 35,
    event: 36,
    rd_advance_loan: 40,
    angel_group: 50,
    vc: 55,
  };
  let o = base[type] ?? 45;
  if (bucket === "early_revenue" && type === "accelerator") o = 10;
  if (bucket === "scaling" && (type === "incubator" || type === "government")) o = 10;
  return o;
}

function programAction(row: AuProgramRow, w: NextWindow): string {
  switch (row.program_type) {
    case "community":
      return `Join ${row.name} — go to the next meetup and start building your network (free).`;
    case "corporate":
      return `Redeem ${row.name} now — credits/perks are instant and equity-free.`;
    case "pre_accelerator":
      return w.closes_at ? `Apply to ${row.name} before ${w.closes_at}.` : `Apply to ${row.name} (rolling).`;
    case "accelerator":
    case "university":
      return w.closes_at
        ? `Prepare and lodge your ${row.name} application — closes ${w.closes_at}${w.kind === "estimated" ? " (estimated)" : ""}.`
        : `Prepare your ${row.name} application ~3 months before the next cohort.`;
    case "angel_group":
      return `Pitch to ${row.name} once you have 2–4 months of post-accelerator traction (ESIC check first).`;
    case "vc":
      return `Open a conversation with ${row.name} — warm intro via your accelerator or angels.`;
    case "competition":
      return w.closes_at ? `Enter ${row.name} (closes ${w.closes_at}) for visibility with investors.` : `Enter ${row.name} for visibility.`;
    case "event":
      return `Attend ${row.name}${w.cohort_start ? ` (${w.cohort_start})` : ""} — meet operators, angels and program leads.`;
    case "government":
      return `Book ${row.name} — free advice / facilities.`;
    default:
      return `Engage ${row.name}.`;
  }
}

function grantAction(row: AuGrantRow, sg: ScoredGrant): string {
  const w = sg.next_window;
  if (sg.timing === "between_rounds") {
    return `Prepare your ${row.name} application now so it is ready when the next round opens${w.opens_at ? ` (~${w.opens_at})` : ""}.`;
  }
  if (w.closes_at && w.kind === "dated") return `Lodge ${row.name} before ${w.closes_at}.`;
  if (row.funding_type === "advisory_service") return `Book ${row.name} (free/low-cost advice).`;
  return `Apply for ${row.name} (${w.label.toLowerCase()}).`;
}

function stageMilestone(bucket: StageBucket, today: Date): TimelineItem | null {
  const at = (m: number) => toMonthKey(addMonths(firstOfMonth(today), m));
  switch (bucket) {
    case "idea":
      return {
        month: at(3),
        kind: "milestone",
        ref_id: "milestone-validate",
        name: "Problem validated + prototype scoped",
        action: "Have 20+ customer interviews and a scoped prototype before spending on accelerator applications.",
        lead_time_days: 0,
        why: "Pre-accelerators and state vouchers ask for evidence of demand, not just an idea.",
      };
    case "mvp":
      return {
        month: at(4),
        kind: "milestone",
        ref_id: "milestone-first-customers",
        name: "First paying pilots",
        action: "Convert 3–5 pilots to paying customers; this unlocks early-revenue grants and angel conversations.",
        lead_time_days: 0,
        why: "Most accelerators and Stream-2 grants weight traction over technology.",
      };
    case "early_revenue":
      return {
        month: at(5),
        kind: "milestone",
        ref_id: "milestone-angel-round",
        name: "Angel / pre-seed round open",
        action: "Open the round 2–4 months after Demo Day with ESIC status confirmed — it is a real dilution reducer.",
        lead_time_days: 0,
        why: "ESIC's 20% investor offset and CGT exemption make the same cheque cheaper for angels.",
      };
    default:
      return {
        month: at(3),
        kind: "milestone",
        ref_id: "milestone-export-plan",
        name: "Export / scale plan signed off",
        action: "Lock a 12-month export plan with target markets so EMDG, Landing Pads and EFA applications share one evidence pack.",
        lead_time_days: 0,
        why: "Scaling-stage programs ask for the same export evidence — prepare it once.",
      };
  }
}

// ─── Orchestration ───────────────────────────────────────────────────────────

function summarise(grants: ScoredGrant[], programs: ScoredProgram[], timeline: TimelineItem[]): FundingPreview {
  return {
    grant_count: grants.length,
    program_count: programs.length,
    top_grants: grants.slice(0, 3).map((g) => g.name),
    top_programs: programs.slice(0, 3).map((p) => p.name),
    total_amount_max_aud: grants.reduce((sum, g) => sum + (g.grant.amount_max_aud ?? 0), 0),
    top_grants_amount_max_aud: grants.slice(0, 5).reduce((sum, g) => sum + (g.grant.amount_max_aud ?? 0), 0),
    timeline_count: timeline.length,
  };
}

/**
 * Free preview: counts, top-3 names and the headline "up to A$X" total. Pure
 * and cheap — safe to call on every /funding hero render.
 */
export function previewFundingReport(
  profile: GrantProfile,
  grants: AuGrantRow[],
  programs: AuProgramRow[],
  today?: Date,
): FundingPreview {
  const g = matchGrants(profile, grants, today);
  const p = matchPrograms(profile, programs, today);
  const t = buildTimeline(profile, g, p, today);
  return summarise(g, p, t);
}

/** Orchestrates match → timeline → (optional) narrative into one report. */
export async function generateFundingReport(input: GenerateFundingReportInput): Promise<FundingReport> {
  const now = resolveToday(input.today);
  const topN = input.topN ?? 8;
  const g = screenGrants(input.profile, input.grants, now);
  const p = screenPrograms(input.profile, input.programs, now);
  const timeline = buildTimeline(input.profile, g.matched, p.matched, now);

  const report: FundingReport = {
    generated_at: new Date().toISOString(),
    today: toIsoDate(now),
    profile: input.profile,
    grants: g.matched,
    programs: p.matched,
    excluded: { grants: g.excluded, programs: p.excluded },
    timeline,
    tax: g.tax,
    summary: summarise(g.matched, p.matched, timeline),
    disclaimer: FUNDING_DISCLAIMER,
  };

  if (input.withNarrative) {
    const top: NarrativeInput = {
      grants: g.matched.slice(0, topN),
      programs: p.matched.slice(0, topN),
      timeline,
      catalogue: { grants: input.grants, programs: input.programs },
      totals: { grants: g.matched.length, programs: p.matched.length },
    };
    const narrative = await narrateFundingPlan(input.profile, top);
    report.narrative_md = narrative.narrative_md;
    report.actions = narrative.actions;
    report.narrative_source = narrative.source;
  }

  return report;
}
