// LP-report anonymisation policy — founder-contribution slot.
//
// Closes the §1 phase 12 P2 gap in
// docs/plans/atlassian-standard-mapping-goal.md:
//   "LP-report anonymisation k-threshold policy documented but no unit-test
//    fixture."
//
// The reseller-side k-anonymity primitives already live at
// `web/src/lib/reseller/portfolio-aggregates.ts` (K_ANONYMITY_THRESHOLD=5)
// and drive the accelerator's own quarterly LP report bundle. This module
// is the **founder-side mirror** — the policy layer a founder sees when
// they opt into an accelerator LP-report bundle at Chapter 12 (Exit /
// Beyond). It codifies what the founder-contributed slot must strip
// before it can be handed to the reseller side.
//
// Anchors:
//  - Guide copy at web/src/lib/guide/startup-journey.ts:1100 + :1115
//    ("Even anonymised, the shape of your revenue curve is recognisable
//    to peers — read what fields surface before you approve, every
//    quarter.")
//  - Reseller K_ANONYMITY_THRESHOLD=5 default (mirrored here as
//    LP_REPORT_K_THRESHOLD so the two ends of the pipe never drift).
//  - Privacy Act 1988 (Cth) APP 6 (use/disclosure) — the founder's
//    consent is only for AGGREGATED, ANONYMISED metrics; the policy
//    hard-strips the fields APP 6 does not permit re-purposing without
//    a fresh consent (customer names, individual employee names,
//    exact valuations, exact revenue).
//
// Pure — no I/O, no framework imports. String in / string out so the
// test fixture can pin every branch of the branch matrix.

/**
 * Default k-anonymity threshold for LP-report contributions.
 * Aligned with `K_ANONYMITY_THRESHOLD` in `web/src/lib/reseller/
 * portfolio-aggregates.ts` so the founder side and reseller side agree
 * on when a cohort is too small to expose.
 */
export const LP_REPORT_K_THRESHOLD = 5;

/**
 * Growth bands used when `revealShape=false` — the founder's revenue
 * curve is bucketed into a coarse growth-rate chip instead of a raw
 * number series. Buckets are inclusive of the lower bound.
 */
export const LP_REPORT_GROWTH_BANDS = [
  { key: "contracting", label: "Contracting", minMoM: -Infinity, maxMoM: -0.05 },
  { key: "flat", label: "Flat", minMoM: -0.05, maxMoM: 0.05 },
  { key: "steady", label: "Steady growth", minMoM: 0.05, maxMoM: 0.15 },
  { key: "strong", label: "Strong growth", minMoM: 0.15, maxMoM: 0.3 },
  { key: "hyper", label: "Hyper growth", minMoM: 0.3, maxMoM: Infinity },
] as const;

export type LpReportGrowthBandKey = (typeof LP_REPORT_GROWTH_BANDS)[number]["key"];

/**
 * Fixed AFSL + privacy hedge attached to every anonymisation result so
 * no downstream renderer can leak the founder slot without it. Cites
 * APP 6 + s766B Corps Act so the "aggregated, not personal advice"
 * boundary is legible on face.
 */
export const LP_REPORT_ANONYMISATION_DISCLAIMER =
  "Anonymised aggregate for the accelerator's LP report only. General information under Privacy Act 1988 (Cth) APP 6 and s766B Corporations Act 2001 (Cth) — not personal financial product advice, not a licensed investor communication. Founder retains the right to withdraw the slot at any time before the reseller bundle locks.";

/**
 * A founder's proposed LP-report contribution slot before anonymisation.
 * Every field is optional — a founder can decline to expose any of them
 * per Chapter 12 mentoring copy ("you still control what fields surface").
 */
export interface LpReportSlotInput {
  /** Legal / trading name — always stripped, replaced with cohort_id. */
  companyName?: string | null;
  /** Founder name(s) — always stripped. */
  founderNames?: readonly string[] | null;
  /** Named customer logos — always stripped (APP 6 + s18 ACL). */
  customerLogos?: readonly string[] | null;
  /** Exact valuation — always coarsened to a valuation band. */
  latestValuationAud?: number | null;
  /** Exact ARR / MRR — coarsened when revealShape=false. */
  arrAud?: number | null;
  /** Headcount at reporting date — coarsened to a band. */
  headcount?: number | null;
  /**
   * Trailing-12 monthly revenue series (AUD). If provided AND
   * revealShape=true, the curve is exposed verbatim. If revealShape=false
   * (the safe default) it is bucketed into a single growth band chip so
   * peers cannot recognise the founder from the curve shape.
   */
  monthlyRevenueSeriesAud?: readonly number[] | null;
  /** Sector chip (SaaS / fintech / etc.) — always exposed as low-risk. */
  sector?: string | null;
  /** Growth phase (1..12) — always exposed as low-risk. */
  growthPhase?: number | null;
}

export type LpReportRedactionKind =
  | "cohort_below_k"
  | "founder_isolated_in_band"
  | "customer_logos_stripped"
  | "company_name_stripped"
  | "founder_names_stripped"
  | "valuation_coarsened"
  | "revenue_coarsened"
  | "headcount_coarsened"
  | "revenue_series_stripped_below_k"
  | "revenue_curve_shape_hidden"
  | "no_signal";

export interface LpReportRedaction {
  kind: LpReportRedactionKind;
  reason: string;
}

export interface LpReportValuationBand {
  key: "sub_1m" | "1m_5m" | "5m_25m" | "25m_100m" | "100m_plus";
  label: string;
}

export interface LpReportHeadcountBand {
  key: "solo" | "small" | "medium" | "large" | "very_large";
  label: string;
}

export interface LpReportRedactedSlot {
  /** Opaque cohort/founder id — never the legal name. */
  cohortId: string;
  sector: string | null;
  growthPhase: number | null;
  /** Growth-band chip when revealShape=false; null when insufficient data. */
  growthBand: LpReportGrowthBandKey | null;
  /** Full monthly series ONLY when revealShape=true AND cohortSize >= k. */
  monthlyRevenueSeriesAud: readonly number[] | null;
  valuationBand: LpReportValuationBand | null;
  headcountBand: LpReportHeadcountBand | null;
}

export interface AssessLpReportSlotInput {
  slot: LpReportSlotInput;
  /** How many founders total are in the reseller's cohort this quarter. */
  cohortSize: number;
  /**
   * How many other founders in the cohort share this founder's growth-band
   * + sector combination. Used to detect the "isolated founder in a shared
   * band" case where k-anonymity is technically met at the cohort level
   * but the founder is still uniquely recognisable inside the slice.
   */
  peersInSameGrowthBand?: number;
  /** Override k for tests / bespoke reseller policies. Defaults to 5. */
  k?: number;
  /** If true, expose the raw monthly revenue series. Defaults to false. */
  revealShape?: boolean;
  /** Deterministic cohort id assigned by the reseller. */
  cohortId?: string;
}

export interface LpReportSlotAssessment {
  ok: boolean;
  redactions: LpReportRedaction[];
  warnings: string[];
  slot: LpReportRedactedSlot;
  disclaimer: string;
}

const VALUATION_BANDS: readonly LpReportValuationBand[] = [
  { key: "sub_1m", label: "Under A$1M" },
  { key: "1m_5m", label: "A$1M–A$5M" },
  { key: "5m_25m", label: "A$5M–A$25M" },
  { key: "25m_100m", label: "A$25M–A$100M" },
  { key: "100m_plus", label: "A$100M+" },
];

const HEADCOUNT_BANDS: readonly LpReportHeadcountBand[] = [
  { key: "solo", label: "1–2" },
  { key: "small", label: "3–10" },
  { key: "medium", label: "11–25" },
  { key: "large", label: "26–100" },
  { key: "very_large", label: "100+" },
];

function coarsenValuation(aud: number | null | undefined): LpReportValuationBand | null {
  if (aud == null || !Number.isFinite(aud) || aud < 0) return null;
  if (aud < 1_000_000) return VALUATION_BANDS[0];
  if (aud < 5_000_000) return VALUATION_BANDS[1];
  if (aud < 25_000_000) return VALUATION_BANDS[2];
  if (aud < 100_000_000) return VALUATION_BANDS[3];
  return VALUATION_BANDS[4];
}

function coarsenHeadcount(n: number | null | undefined): LpReportHeadcountBand | null {
  if (n == null || !Number.isFinite(n) || n < 0) return null;
  if (n <= 2) return HEADCOUNT_BANDS[0];
  if (n <= 10) return HEADCOUNT_BANDS[1];
  if (n <= 25) return HEADCOUNT_BANDS[2];
  if (n <= 100) return HEADCOUNT_BANDS[3];
  return HEADCOUNT_BANDS[4];
}

function averageMoMGrowth(series: readonly number[] | null | undefined): number | null {
  if (!series || series.length < 2) return null;
  const cleaned = series.filter((n) => Number.isFinite(n) && n >= 0);
  if (cleaned.length < 2) return null;
  const deltas: number[] = [];
  for (let i = 1; i < cleaned.length; i++) {
    const prev = cleaned[i - 1];
    const curr = cleaned[i];
    if (prev <= 0) continue;
    deltas.push((curr - prev) / prev);
  }
  if (deltas.length === 0) return null;
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  return Number.isFinite(mean) ? mean : null;
}

function pickGrowthBand(mom: number | null): LpReportGrowthBandKey | null {
  if (mom == null || !Number.isFinite(mom)) return null;
  for (const band of LP_REPORT_GROWTH_BANDS) {
    if (mom >= band.minMoM && mom < band.maxMoM) return band.key;
  }
  return null;
}

/**
 * Assess a founder's proposed LP-report slot and return the anonymised
 * shape the reseller pack may bundle. Never throws — malformed values
 * fall through to null and surface as redactions the founder can review.
 *
 * Branch matrix (pinned by lp-report-anonymisation.test.ts):
 *  1. cohortSize < k                 → everything blanked ("cohort_below_k")
 *  2. cohortSize >= k                → names/logos stripped always,
 *                                      valuation + headcount always
 *                                      coarsened, revenue series
 *                                      exposed only if revealShape=true
 *                                      AND cohort meets k
 *  3. peersInSameGrowthBand < k-1    → "founder_isolated_in_band" warning
 *                                      even when cohortSize meets k
 *  4. revealShape=false              → series stripped, band chip only
 *  5. missing revenue signal         → "no_signal" redaction, band null
 */
export function assessLpReportSlot(
  input: AssessLpReportSlotInput,
): LpReportSlotAssessment {
  const k = input.k ?? LP_REPORT_K_THRESHOLD;
  const cohortSize = Number.isFinite(input.cohortSize) ? Math.max(0, input.cohortSize) : 0;
  const revealShape = input.revealShape === true;
  const cohortId = input.cohortId?.trim() || "cohort-founder-anon";

  const redactions: LpReportRedaction[] = [];
  const warnings: string[] = [];

  // Branch 1: cohort below k. Blank everything except non-identifying
  // sector + phase chips.
  if (cohortSize < k) {
    redactions.push({
      kind: "cohort_below_k",
      reason: `Cohort has ${cohortSize} founders; k-threshold is ${k}. All metrics blanked until the cohort grows.`,
    });
    return {
      ok: false,
      redactions,
      warnings,
      slot: {
        cohortId,
        sector: input.slot.sector ?? null,
        growthPhase: input.slot.growthPhase ?? null,
        growthBand: null,
        monthlyRevenueSeriesAud: null,
        valuationBand: null,
        headcountBand: null,
      },
      disclaimer: LP_REPORT_ANONYMISATION_DISCLAIMER,
    };
  }

  // Cohort meets k — apply the always-on strips first.
  if (input.slot.companyName?.trim()) {
    redactions.push({
      kind: "company_name_stripped",
      reason: "Legal / trading names are never included in an LP-report founder slot (APP 6).",
    });
  }
  if (input.slot.founderNames && input.slot.founderNames.length > 0) {
    redactions.push({
      kind: "founder_names_stripped",
      reason: "Individual founder names are never included in an LP-report founder slot (APP 6).",
    });
  }
  if (input.slot.customerLogos && input.slot.customerLogos.length > 0) {
    redactions.push({
      kind: "customer_logos_stripped",
      reason: "Customer logos / named accounts are never included in an LP-report founder slot (APP 6 + s18 ACL).",
    });
  }

  const valuationBand = coarsenValuation(input.slot.latestValuationAud);
  if (input.slot.latestValuationAud != null) {
    redactions.push({
      kind: "valuation_coarsened",
      reason: "Exact valuation coarsened to a band; exact valuations are never exposed even at k+.",
    });
  }

  const headcountBand = coarsenHeadcount(input.slot.headcount);
  if (input.slot.headcount != null) {
    redactions.push({
      kind: "headcount_coarsened",
      reason: "Exact headcount coarsened to a band; exact headcount can identify small startups.",
    });
  }

  // Revenue curve — the founder-side sensitive one.
  const series = input.slot.monthlyRevenueSeriesAud ?? null;
  const mom = averageMoMGrowth(series);
  const growthBand = pickGrowthBand(mom);
  let monthlyRevenueSeriesAud: readonly number[] | null = null;

  if (!series || series.length === 0) {
    if (input.slot.arrAud != null) {
      redactions.push({
        kind: "revenue_coarsened",
        reason: "ARR / MRR coarsened to a growth-band chip; exact revenue is never exposed.",
      });
    } else {
      redactions.push({
        kind: "no_signal",
        reason: "No revenue series or ARR provided — LP report shows sector + phase only.",
      });
    }
  } else if (revealShape) {
    if (cohortSize >= k) {
      monthlyRevenueSeriesAud = series;
    } else {
      // Belt-and-braces — should not fire because we returned above,
      // kept for future k-per-branch policies.
      redactions.push({
        kind: "revenue_series_stripped_below_k",
        reason: `Revenue series stripped because cohort has ${cohortSize} founders; k is ${k}.`,
      });
    }
  } else {
    redactions.push({
      kind: "revenue_curve_shape_hidden",
      reason: "Revenue series bucketed into a growth-band chip; raw curve hidden so peers cannot recognise the founder from its shape.",
    });
  }

  // Branch 3: founder isolated in their (sector, growth-band) slice.
  // The reseller's cohort may hit k in total but only a handful share
  // the same growth band; if the founder is the only one, peers can
  // still identify them. Warn (do not block) — the founder makes the
  // final call per Chapter 12 mentoring copy.
  if (
    typeof input.peersInSameGrowthBand === "number" &&
    Number.isFinite(input.peersInSameGrowthBand) &&
    input.peersInSameGrowthBand < k - 1
  ) {
    warnings.push(
      `Only ${input.peersInSameGrowthBand} other founders share your growth band this quarter; even the coarsened chip may identify you.`,
    );
    redactions.push({
      kind: "founder_isolated_in_band",
      reason: "Founder is the majority of their growth-band slice — reseller must widen the band or drop the chip.",
    });
  }

  return {
    ok: true,
    redactions,
    warnings,
    slot: {
      cohortId,
      sector: input.slot.sector ?? null,
      growthPhase: input.slot.growthPhase ?? null,
      growthBand,
      monthlyRevenueSeriesAud,
      valuationBand,
      headcountBand,
    },
    disclaimer: LP_REPORT_ANONYMISATION_DISCLAIMER,
  };
}
