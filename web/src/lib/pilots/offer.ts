// G16-C — Evaluator pilot offer v2 ("Free cohort scoring for one intake").
//
// One source of truth for the terms that /pilot, the welcome e-mail, the
// admin page and the ledger defaults all quote. Figures come from the GTM
// doc (docs/plans/g14-investor-feedback-2026-09-16/01-gtm-evaluators-90d.md
// § 3) and the traction kit (docs/marketing/traction-kit-2026-09/
// t2-accelerator-pilots.md § 3 — the 7 success criteria). Prices are read
// from plans-v2 / credits so a price change cannot leave a literal behind.
//
// House rules baked in: the comp is an ADMIN plan + credit grant — never a
// Stripe coupon, card not required; `investor_vc_small` is the Program
// rung; cap 5 active pilots (the sixth pays list price).

import { FEATURE_COSTS } from "@/lib/credits";
import { PLANS_V2, formatAud } from "@/lib/plans-v2";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/valuation-certificate/types";

export { DATA_PRINCIPLE_SENTENCE };

/** F-1: the comped tier (Program). */
export const PILOT_TIER = "investor_vc_small" as const;
/** F-1: pilot length in days. */
export const DEFAULT_PILOT_DAYS = 30;
/** F-1: at most this many pilots may be `active` at once. */
export const PILOT_CAP = 5;
/** One live intake / cohort, at most this many applicants. */
export const PILOT_MAX_APPLICANTS = 60;
/** T-3 d reminder. */
export const PILOT_REMINDER_DAYS_BEFORE = 3;
/** LOI trigger: pass at least this many of the 7 success criteria. */
export const PILOT_LOI_PASS_MARK = 5;
/** Hard ceilings for the admin form. */
export const PILOT_MAX_DAYS = 90;
export const PILOT_MAX_CREDITS = 5_000;

const PROGRAM_PLAN = PLANS_V2.find((p) => p.id === PILOT_TIER);

/** Program list price per month, e.g. "A$349". */
export function programListPrice(): string {
  return formatAud(PROGRAM_PLAN?.monthly_aud ?? null);
}

/** Cohort 25 LOI price (GTM § 3) — one literal, the SKU has no plans-v2 row. */
export const COHORT_25_ANNUAL_AUD = 5_000;

/**
 * Default credit grant: the evaluator path's list cost per Trusted
 * Business Report (`FEATURE_COSTS.trust_report`, A$3) × the applicant cap.
 * Program's monthly report quota is consumed first (lib/evaluations/
 * report-quota.ts); the grant covers anything past it.
 */
export function defaultPilotCredits(): number {
  return Math.ceil(FEATURE_COSTS.trust_report * PILOT_MAX_APPLICANTS);
}

export interface PilotOfferTerm {
  term: string;
  value: string;
}

/** Offer v2 table, in the GTM doc's order. */
export function pilotOfferTerms(): PilotOfferTerm[] {
  return [
    {
      term: "What",
      value: `One live intake or cohort, up to ${PILOT_MAX_APPLICANTS} applicants, scored on the 8-dimension / 13-criteria rubric. Cohort table + CSV, a sponsor / LP report sample and an Investor Dossier per startup.`,
    },
    { term: "How long", value: `${DEFAULT_PILOT_DAYS} days from the first batch run.` },
    {
      term: "Price",
      value: `Free — comped by an admin credit grant on a Program-tier workspace (${programListPrice()}/mo list). No Stripe coupon, no card required.`,
    },
    { term: "Cap", value: `${PILOT_CAP} pilots. The sixth pays list price.` },
    {
      term: "Intake link",
      value: "Sent in the welcome e-mail: your program hands out /apply/<slug>; applicants land scored in your inbox.",
    },
  ];
}

/** "In return (all four)" — GTM § 3. */
export const PILOT_IN_RETURN: readonly string[] = [
  `An LOI to Cohort 25 at ${formatAud(COHORT_25_ANNUAL_AUD)}/yr or Program at ${programListPrice()}/mo if at least ${PILOT_LOI_PASS_MARK} of the 7 success criteria pass.`,
  `A named case study after day ${DEFAULT_PILOT_DAYS} (written approval; placeholders until then).`,
  "The committee ranks its own top 10 before seeing the SVI table.",
  "One 45-minute interview on the instrument.",
];

/** "Not included" — GTM § 3. */
export const PILOT_NOT_INCLUDED: readonly string[] = [
  "Formal valuation or investment advice.",
  "Cross-startup evidence sharing — nothing about one startup is shown to another.",
  "SSO / white-label.",
  "Discounts after the pilot (one list price).",
];

export interface PilotSuccessCriterion {
  n: number;
  criterion: string;
  passMark: string;
  measuredBy: string;
}

/** The 7 success criteria — t2-accelerator-pilots.md § 3, verbatim figures. */
export const PILOT_SUCCESS_CRITERIA: readonly PilotSuccessCriterion[] = [
  { n: 1, criterion: "Coverage", passMark: "≥ 90 % of the round scored with a full report inside 72 h of the batch run", measuredBy: "cohort table" },
  { n: 2, criterion: "Committee agreement", passMark: "committee ranks its own top 5; ≥ 3 of them are in BlockID's top 10 by weighted score — and every disagreement can be traced to a named criterion", measuredBy: "walkthrough call notes" },
  { n: 3, criterion: "Auditor value", passMark: "at least one unsupported claim flagged that the committee had not caught", measuredBy: "walkthrough call notes" },
  { n: 4, criterion: "Time saved", passMark: "program's own estimate of hours saved on first-pass screening, in writing", measuredBy: "collected from the pilot" },
  { n: 5, criterion: "Sponsor report", passMark: "program would send the sample (with edits) to its sponsor / LP / university as-is or with minor edits", measuredBy: "day-14 review" },
  { n: 6, criterion: "Founder consent", passMark: "≥ 50 % of scored founders accept the claim link (they want their own score)", measuredBy: "evaluations consent tiers" },
  { n: 7, criterion: "Commercial", passMark: `program decides paid Program (${programListPrice()}/mo) or Contact Sales (multi-cohort) by day 14`, measuredBy: "Stripe" },
];
