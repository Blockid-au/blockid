// P12c-lp-report-ui — form-state helpers for the /workspace/lp-report founder
// composer. Consumes the pure `assessLpReportSlot()` policy library shipped
// under P12c-lp-report-anon-policy at
// `web/src/lib/investor-pack/lp-report-anonymisation.ts` so the founder can
// preview the anonymisation redactions + warnings live before locking a
// contribution slot for an accelerator's LP-report bundle.
//
// Pure — no I/O, no framework imports. Every field is a string so
// <input>/<textarea> values round-trip cleanly.

import type {
  AssessLpReportSlotInput,
  LpReportSlotAssessment,
  LpReportSlotInput,
} from "@/lib/investor-pack/lp-report-anonymisation";

/** Every numeric / list field is a string so <input> can hold "" cleanly. */
export interface LpReportComposerFormState {
  cohort_id: string;
  cohort_size: string;
  peers_in_same_growth_band: string;
  reveal_shape: boolean;
  company_name: string;
  founder_names_csv: string;
  customer_logos_csv: string;
  latest_valuation_aud: string;
  arr_aud: string;
  headcount: string;
  monthly_revenue_series_aud_csv: string;
  sector: string;
  growth_phase: string;
}

/**
 * Blank slate — the founder must supply their own numbers before the
 * assessment fires meaningful redactions. Only `reveal_shape` defaults to
 * false to match the safe default in `assessLpReportSlot()` (revenue-curve
 * shape hidden until the founder explicitly opts in).
 */
export function makeEmptyLpReportComposerFormState(): LpReportComposerFormState {
  return {
    cohort_id: "",
    cohort_size: "",
    peers_in_same_growth_band: "",
    reveal_shape: false,
    company_name: "",
    founder_names_csv: "",
    customer_logos_csv: "",
    latest_valuation_aud: "",
    arr_aud: "",
    headcount: "",
    monthly_revenue_series_aud_csv: "",
    sector: "",
    growth_phase: "",
  };
}

function optionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

function requiredNonNegativeInt(raw: string): number {
  const n = optionalNumber(raw);
  if (n == null || n < 0) return 0;
  return Math.floor(n);
}

/**
 * Split a CSV / semicolon / newline separated list of names into a
 * deduped, non-empty string array. Whitespace is trimmed; blank tokens
 * dropped.
 */
export function parseNameList(raw: string): string[] {
  if (!raw.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of raw.split(/[,;\n]+/)) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Parse a CSV / whitespace-separated monthly revenue series into a number
 * array. Non-finite / negative entries are silently dropped so a paste of
 * "12000, 15000, na, 18000" cleanly becomes [12000, 15000, 18000].
 */
export function parseMonthlyRevenueSeries(raw: string): number[] {
  if (!raw.trim()) return [];
  const out: number[] = [];
  for (const token of raw.split(/[\s,;]+/)) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const n = Number.parseFloat(trimmed);
    if (Number.isFinite(n) && n >= 0) out.push(n);
  }
  return out;
}

/**
 * Convert form state → AssessLpReportSlotInput. Blank optional fields
 * collapse to `null` (not 0) so the assessor's "unspecified" branches fire
 * correctly — a founder who didn't fill in `latest_valuation_aud` should
 * not see a "valuation coarsened" redaction.
 */
export function toLpReportSlotInput(
  state: LpReportComposerFormState,
): AssessLpReportSlotInput {
  const founderNames = parseNameList(state.founder_names_csv);
  const customerLogos = parseNameList(state.customer_logos_csv);
  const monthlyRevenueSeriesAud = parseMonthlyRevenueSeries(
    state.monthly_revenue_series_aud_csv,
  );
  const growthPhase = optionalNumber(state.growth_phase);
  const peers = optionalNumber(state.peers_in_same_growth_band);

  const slot: LpReportSlotInput = {
    companyName: state.company_name.trim() || null,
    founderNames: founderNames.length > 0 ? founderNames : null,
    customerLogos: customerLogos.length > 0 ? customerLogos : null,
    latestValuationAud: optionalNumber(state.latest_valuation_aud),
    arrAud: optionalNumber(state.arr_aud),
    headcount: optionalNumber(state.headcount),
    monthlyRevenueSeriesAud:
      monthlyRevenueSeriesAud.length > 0 ? monthlyRevenueSeriesAud : null,
    sector: state.sector.trim() || null,
    growthPhase: growthPhase != null ? Math.floor(growthPhase) : null,
  };

  const input: AssessLpReportSlotInput = {
    slot,
    cohortSize: requiredNonNegativeInt(state.cohort_size),
    revealShape: state.reveal_shape,
  };
  const cohortId = state.cohort_id.trim();
  if (cohortId) input.cohortId = cohortId;
  if (peers != null && peers >= 0) input.peersInSameGrowthBand = Math.floor(peers);
  return input;
}

export type LpReportBand = "green" | "amber" | "red" | "grey";

/**
 * Traffic-light band for the preview banner:
 *  - grey when the founder has not entered a cohort size yet (no signal),
 *  - red when the cohort is below k (everything blanked),
 *  - amber when the assessment is ok but has warnings (isolated in band),
 *  - green when the assessment is ok with no warnings.
 *
 * Mirrors the `assessLpReportSlot()` return shape 1:1 so the tile colour
 * agrees with the policy library's classification without a second layer
 * of thresholds.
 */
export function pickLpReportBand(
  assessment: LpReportSlotAssessment,
  state: LpReportComposerFormState,
): LpReportBand {
  if (!state.cohort_size.trim()) return "grey";
  if (!assessment.ok) return "red";
  if (assessment.warnings.length > 0) return "amber";
  return "green";
}

/** Headline copy per band — wizard + tests pull from the same source. */
export const LP_REPORT_HEADLINE: Record<LpReportBand, string> = {
  grey: "Enter a cohort size to preview your slot",
  green: "Slot is ready for the reseller bundle",
  amber: "Slot is ready — with a peer-recognition warning",
  red: "Cohort is below k — slot cannot be included",
};
