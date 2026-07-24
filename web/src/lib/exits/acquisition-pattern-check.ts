// P11-acquisition-wizard (Chapter 11 — Scale & Acquisition) — pure helper that
// scores a founder-supplied deal shape against the reusable ~90% cash / ~10%
// retention-RSU template Atlassian ran on Trello 2017, OpsGenie 2018, and
// Loom 2023 (see /guide/11-scale acquisition-pattern section). Signal, not
// advice. Downstream wiring (`/dashboard/exit-readiness` wizard tile) is a
// separate tick — this leaf lib ships standalone so any surface that needs a
// deal-shape checker can consume it without waiting.

export type AcquisitionInput = {
  headline_value_aud: number;
  cash_pct?: number | null;
  rsu_pct?: number | null;
  earnout_pct?: number | null;
  escrow_pct?: number | null;
  escrow_months?: number | null;
  rsu_cliff_months?: number | null;
  rsu_vest_months?: number | null;
  target_industry_keywords?: readonly string[];
  buyer_is_foreign_govt_influenced?: boolean;
  buyer_is_listed?: boolean;
  change_of_control_consents_pct?: number | null;
};

export type AcquisitionSignal = "green" | "amber" | "red";

export type AcquisitionPatternCheck = {
  matches_atlassian_pattern: boolean;
  overall_signal: AcquisitionSignal;
  cash_pct: number | null;
  rsu_pct: number | null;
  earnout_pct: number | null;
  escrow_pct: number | null;
  splits_align: boolean;
  rsu_structure_ok: boolean;
  escrow_structure_ok: boolean;
  firb_pre_lodgment_required: boolean;
  firb_reason: "threshold_exceeded" | "sensitive_sector" | "foreign_govt_influence" | null;
  change_of_control_gap: boolean;
  change_of_control_consents_pct: number | null;
  warnings: string[];
  recommendations: string[];
  disclaimer: string;
};

export const ACQUISITION_PATTERN_DISCLAIMER =
  "Signal, not advice — the ~90% cash / ~10% retention-RSU template derives " +
  "from Atlassian's Trello 2017, OpsGenie 2018, and Loom 2023 acquisitions. " +
  "Every deal has bespoke tax (CGT event A1 ITAA 1997 s104-10; Subdiv 124-M " +
  "scrip-for-scrip rollover only applies to share consideration; Subdiv 83A-C " +
  "may apply on the RSU tranche when the buyer is listed), FIRB, and " +
  "change-of-control considerations. Engage a specialist M&A lawyer before " +
  "signing an LOI.";

// FIRB Register 2026 monetary threshold for non-government-influenced buyers
// acquiring a non-sensitive AU target (business.gov.au FIRB guidance note 3).
export const FIRB_THRESHOLD_2026_AUD = 339_000_000;

// Atlassian precedent bands. Cash range brackets the 88-92% figures reported
// across Trello/OpsGenie/Loom; RSU range mirrors it. Kept as ranges (not point
// values) so a founder within a few points either way still lands "aligned".
export const CASH_PCT_ATLASSIAN_MIN = 0.85;
export const CASH_PCT_ATLASSIAN_MAX = 0.95;
export const RSU_PCT_ATLASSIAN_MIN = 0.05;
export const RSU_PCT_ATLASSIAN_MAX = 0.15;
export const ESCROW_PCT_MIN = 0.1;
export const ESCROW_PCT_MAX = 0.15;
export const ESCROW_MONTHS_MIN = 12;
export const ESCROW_MONTHS_MAX = 18;
export const RSU_CLIFF_MONTHS = 12;
export const RSU_VEST_MONTHS_MIN = 24;
export const RSU_VEST_MONTHS_MAX = 36;
export const CHANGE_OF_CONTROL_CONSENT_TARGET = 0.95;
export const CHANGE_OF_CONTROL_CONSENT_RED_FLOOR = 0.7;

// FIRB "notifiable national security action" sensitive-sector keywords. Matched
// case-insensitively against target_industry_keywords. Not exhaustive — the
// FIRB critical-infrastructure list is longer — but covers the most common
// sensitive tech + infra sectors that trip the notify-first rule.
const FIRB_SENSITIVE_KEYWORDS: readonly string[] = [
  "critical infrastructure",
  "energy",
  "telecommunications",
  "port",
  "airport",
  "data centre",
  "data center",
  "cyber",
  "defence",
  "defense",
  "quantum",
  "artificial intelligence",
  "biotech",
  "genomics",
  "space",
  "satellite",
  "critical minerals",
  "rare earth",
  "media",
];

function normalisePct(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (raw < 0) return null;
  const asFraction = raw > 1 ? raw / 100 : raw;
  if (asFraction > 1) return 1;
  return asFraction;
}

function normaliseMonths(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (raw < 0) return null;
  return raw;
}

function detectFirb(input: AcquisitionInput): {
  required: boolean;
  reason: AcquisitionPatternCheck["firb_reason"];
} {
  if (input.buyer_is_foreign_govt_influenced) {
    return { required: true, reason: "foreign_govt_influence" };
  }
  const keywords = input.target_industry_keywords ?? [];
  const sensitiveHit = keywords.some((kw) => {
    if (typeof kw !== "string") return false;
    const needle = kw.trim().toLowerCase();
    if (!needle) return false;
    return FIRB_SENSITIVE_KEYWORDS.some((s) => needle.includes(s));
  });
  if (sensitiveHit) {
    return { required: true, reason: "sensitive_sector" };
  }
  const headline = Number.isFinite(input.headline_value_aud) ? input.headline_value_aud : 0;
  if (headline >= FIRB_THRESHOLD_2026_AUD) {
    return { required: true, reason: "threshold_exceeded" };
  }
  return { required: false, reason: null };
}

export function assessAcquisitionPattern(input: AcquisitionInput): AcquisitionPatternCheck {
  const cashPct = normalisePct(input.cash_pct);
  const rsuPct = normalisePct(input.rsu_pct);
  const earnoutPct = normalisePct(input.earnout_pct);
  const escrowPct = normalisePct(input.escrow_pct);
  const escrowMonths = normaliseMonths(input.escrow_months);
  const rsuCliff = normaliseMonths(input.rsu_cliff_months);
  const rsuVest = normaliseMonths(input.rsu_vest_months);
  const consentsPct = normalisePct(input.change_of_control_consents_pct);

  const splitsAlign =
    cashPct !== null &&
    rsuPct !== null &&
    cashPct >= CASH_PCT_ATLASSIAN_MIN &&
    cashPct <= CASH_PCT_ATLASSIAN_MAX &&
    rsuPct >= RSU_PCT_ATLASSIAN_MIN &&
    rsuPct <= RSU_PCT_ATLASSIAN_MAX;

  const rsuStructureOk =
    rsuCliff !== null &&
    rsuVest !== null &&
    rsuCliff === RSU_CLIFF_MONTHS &&
    rsuVest >= RSU_VEST_MONTHS_MIN &&
    rsuVest <= RSU_VEST_MONTHS_MAX;

  const escrowStructureOk =
    escrowPct !== null &&
    escrowMonths !== null &&
    escrowPct >= ESCROW_PCT_MIN &&
    escrowPct <= ESCROW_PCT_MAX &&
    escrowMonths >= ESCROW_MONTHS_MIN &&
    escrowMonths <= ESCROW_MONTHS_MAX;

  const firb = detectFirb(input);

  const changeOfControlGap =
    consentsPct !== null && consentsPct < CHANGE_OF_CONTROL_CONSENT_TARGET;
  const consentBelowRedFloor =
    consentsPct !== null && consentsPct < CHANGE_OF_CONTROL_CONSENT_RED_FLOOR;

  const cashOverConcentrated = cashPct !== null && cashPct > 0.98;
  const cashUnderConcentrated = cashPct !== null && cashPct < 0.5;

  const matches = splitsAlign && rsuStructureOk && escrowStructureOk;

  // Red-first ordering — the raise-blockers a founder should fix before the
  // wire clears, then structure gaps, then FIRB (never red on its own — it's
  // a procedural runway, not a deal-killer).
  const warnings: string[] = [];
  if (consentBelowRedFloor) {
    const pct = Math.round((consentsPct ?? 0) * 100);
    warnings.push(
      `Only ${pct}% of material contracts with change-of-control clauses have counterparty consent — the #1 cause of post-completion price adjustments (5-10% common). Chase consents in the 60 days before signing.`,
    );
  } else if (changeOfControlGap) {
    const pct = Math.round((consentsPct ?? 0) * 100);
    warnings.push(
      `${pct}% of material contracts have change-of-control consent — target ≥ 95% before completion or make completion conditional on the outstanding consents.`,
    );
  }
  if (cashOverConcentrated) {
    warnings.push(
      "Cash > 98% of consideration — retained leadership has no equity handcuff past month 12; Atlassian's retention playbook depends on the RSU tranche vesting into month 24-36.",
    );
  }
  if (cashUnderConcentrated) {
    warnings.push(
      "Cash < 50% of consideration — target investors + founders take on more buyer-share risk than the Atlassian template contemplates; check Subdiv 124-M scrip-for-scrip rollover eligibility so sellers are not forced to fund a tax bill from illiquid stock.",
    );
  }
  if (!splitsAlign && cashPct !== null && rsuPct !== null && !cashOverConcentrated && !cashUnderConcentrated) {
    warnings.push(
      "Cash/RSU split diverges from the ~90/10 Atlassian template — cash below 85% risks under-funding sellers at closing; cash above 95% risks losing eng + product leadership by month 18.",
    );
  }
  if (!rsuStructureOk && (rsuCliff !== null || rsuVest !== null)) {
    warnings.push(
      "RSU tranche should carry a 12-month cliff + 24-36 month monthly vest to survive Atlassian's retention playbook — shorter vests give founder-team liquidity before the retention cliff bites.",
    );
  }
  if (!escrowStructureOk && (escrowPct !== null || escrowMonths !== null)) {
    warnings.push(
      "Escrow of 10-15% held 12-18 months is the pattern investors expect for indemnity claims — outside that range invites re-negotiation at completion.",
    );
  }
  if (firb.required) {
    if (firb.reason === "foreign_govt_influence") {
      warnings.push(
        "FIRB pre-lodgment required — buyer is foreign-government-influenced, so any interest in an AU target triggers notification regardless of value. Build 60-90 days runway into completion.",
      );
    } else if (firb.reason === "sensitive_sector") {
      warnings.push(
        "FIRB pre-lodgment required — target sits in a sensitive-tech / critical-infrastructure sector, so notification is triggered regardless of value. Build 60-90 days runway into completion.",
      );
    } else {
      warnings.push(
        `FIRB pre-lodgment required — headline value ≥ A$${FIRB_THRESHOLD_2026_AUD.toLocaleString("en-AU")} 2026 threshold. Build 30-60 days runway into completion.`,
      );
    }
  }

  const recommendations: string[] = [
    "Confirm CGT event A1 timing (ITAA 1997 s104-10) — the tax bill on the cash tranche lands on contract date, not settlement date, so plan the funding gap.",
    "Confirm Subdiv 124-M scrip-for-scrip rollover eligibility — the rollover only applies to share consideration; the cash tranche is not rollover-eligible.",
  ];
  if (input.buyer_is_listed) {
    recommendations.push(
      "Check Subdiv 83A-C deferred ESS taxation on the RSU tranche for AU-resident recipients — buyer is listed, so the concession may apply and defer the recipients' tax bill to vest.",
    );
  }
  recommendations.push(
    "Prep a disclosure schedule that maps 1:1 to data-room folders 1, 2, 4, 5, 6, 7, and 8 — every material contract with a change-of-control clause needs its counterparty consent tracked here.",
  );
  recommendations.push(
    "Engage a specialist M&A lawyer (Corrs / HSF / DLA / Gilbert + Tobin) before signing the LOI — 80% of the leverage is set in the LOI, not the SPA.",
  );

  // Overall signal — red only on the two dealbreakers (consent shortfall past
  // the red floor, or cash concentration that guts the pattern). FIRB alone is
  // procedural, not a signal downgrade. Green when the template matches AND
  // consents are on track (or unspecified).
  let overall: AcquisitionSignal;
  if (consentBelowRedFloor || cashOverConcentrated || cashUnderConcentrated) {
    overall = "red";
  } else if (matches && !changeOfControlGap) {
    overall = "green";
  } else {
    overall = "amber";
  }

  return {
    matches_atlassian_pattern: matches,
    overall_signal: overall,
    cash_pct: cashPct,
    rsu_pct: rsuPct,
    earnout_pct: earnoutPct,
    escrow_pct: escrowPct,
    splits_align: splitsAlign,
    rsu_structure_ok: rsuStructureOk,
    escrow_structure_ok: escrowStructureOk,
    firb_pre_lodgment_required: firb.required,
    firb_reason: firb.reason,
    change_of_control_gap: changeOfControlGap,
    change_of_control_consents_pct: consentsPct,
    warnings,
    recommendations,
    disclaimer: ACQUISITION_PATTERN_DISCLAIMER,
  };
}
