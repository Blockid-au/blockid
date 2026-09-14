// Client-safe credit facts — the numbers marketing copy is allowed to quote.
//
// S31-B (2026-09-13). lib/credits.ts is server-only (it imports Supabase),
// so client surfaces typed the free-signup grant by hand and drifted: the
// /svi entrance said "5 bonus credits — enough for 10 analyses" and "Sign In
// & Get 5 Free Credits" while PLAN_CREDITS.free has granted 3 since the
// 2026-08-01 promo end. This file is the one place the figure lives;
// lib/credits.ts reads it for the actual grant, and copy reads it for the
// promise, so the two cannot disagree again.

/** Credits granted to a new free account (post-promo). */
export const FREE_SIGNUP_CREDITS = 3;

/** Credits one SVI analysis costs — mirrors FEATURE_COSTS.svi_analysis. */
export const SVI_ANALYSIS_CREDITS = 0.5;

/** How many SVI runs the free grant covers, for copy ("enough for N analyses"). */
export function freeSignupAnalyses(): number {
  return Math.floor(FREE_SIGNUP_CREDITS / SVI_ANALYSIS_CREDITS);
}
