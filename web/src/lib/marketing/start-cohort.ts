// start-cohort — the ONE primary program CTA of the site (G25, 2026-09-21).
//
// The founder retired the paid Cohort Validation Pilot and its conversion
// coupon ("bỏ luôn coupon và pilot"). The hero, the nav CTA, the closing
// band and the programs page all point evaluators at the sold ladder
// instead: "Start a cohort" → the existing Cohort 25 annual trial sign-up
// (card required, 14 days, `plans.trial_days`). The Cohort 100 rung sits on
// /solutions/accelerator#plans and /pricing?segment=programs.
//
// Client-safe constants (nav-v2 is a client component) — no catalogue, no
// price, no env var. The /vi mirror keeps its visitor on /vi (review P1,
// 2026-09-20) and lands on the rungs block instead.

export const START_COHORT_LABEL = "Start a cohort";

/** Sign-up with the Cohort 25 annual rung pre-selected — the card-required trial path. */
export const START_COHORT_HREF = "/signup?segment=evaluator&plan=accelerator_starter&trial=1&interval=annual";

/** The Vietnamese home / nav land on the rungs block of the VI programs page. */
export const START_COHORT_VI_HREF = "/vi/solutions/accelerator#plans";

/** Analytics id family for the CTA (`cta_clicked { cta_id, location }`). */
export const START_COHORT_CTA_ID = "start_cohort";
