// accelerator/cohort-offer — what a Cohort plan delivers and the success
// metrics a program and BlockID measure together (G25, 2026-09-21).
//
// These two lists used to live beside the Cohort Validation Pilot SKUs in
// lib/pricing/pilot-skus.ts (G21 P0-C). The founder retired the paid pilot
// and its conversion coupon on 2026-09-21 ("bỏ luôn coupon và pilot"):
// evaluators go straight to the sold ladder — Cohort 25 / Cohort 100 annual
// with the card-required trial (plans-v2), or Scout / Firm / Program. The
// inclusions and the metrics are unchanged; they now describe the Cohort
// plan itself and feed the Cohort proposal (lib/validation/proposal.ts),
// the onboarding kit (/workspace/accelerator/onboarding) and its metrics
// form (lib/accelerator/onboarding-metrics.ts).
//
// Pure constants, no prices — every amount stays in plans-v2.

/** What a Cohort plan includes — one list, both rungs (the FI offer, § 9). */
export const COHORT_INCLUDES: readonly string[] = Object.freeze([
  "Application or existing-cohort setup with your intake link",
  "Startup Value Index assessment for every applicant on one rubric",
  "Evidence confidence level per startup",
  "Cohort comparison table your committee can sort",
  "Top gaps across the cohort",
  "Evaluator table with decision and conviction per startup",
  "Final cohort report for the program and its sponsors",
  "Feedback workshop with your review team",
]);

/** Success metrics the program and BlockID measure together in the first cohort. */
export const COHORT_SUCCESS_METRICS: readonly string[] = Object.freeze([
  "Review time per startup",
  "Evaluator consistency across reviewers",
  "Startups processed through the first cohort",
  "Share of founders completing their evidence",
  "Program and founder satisfaction",
  "Repeat or renewal intent after the first cohort",
]);
