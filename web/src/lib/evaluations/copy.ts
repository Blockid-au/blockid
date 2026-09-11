// Evaluator workspace messaging pack (G12 S13-A — activation checklist +
// trial-end reminder deep link).
//
// The ONE place the evaluator-facing activation strings live: the 4-step
// checklist under the S7-C trial banner on /workspace/evaluations and the
// "report still waiting" line in the T-3d trial-end reminder read from here.
// Keys are flat (`checklist.step2.body`) so a VI catalogue can mirror them
// 1:1 later without restructuring, the same way `funding.copy.*` does.
//
// Rules pinned by copy.test.ts (same as the G11 pack):
//   • every string ≤ 2 sentences (speakability), non-empty;
//   • no "PhD"; the only price allowed is the public ladder (Scout A$79,
//     Firm A$149, Program A$349, Trust BizReport A$3) — no retired A$5.50 / A$99;
//   • `{tokens}` are filled with `fill()` (reused from the funding pack) —
//     an unknown token stays visible as `{token}` rather than vanishing.
//
// No `server-only` import — shared by the client checklist and the cron.

import { fill, type CopyTokens } from "@/lib/funding/copy";

export { fill };
export type { CopyTokens };

export const EVALUATIONS_COPY = {
  // ── Activation checklist (trial → Scout) ──────────────────────────────
  "checklist.title": "Get the most from your trial in 4 steps",
  "checklist.subtitle": "Each step unlocks something Scout keeps doing for you every week.",
  "checklist.progress": "{done} of {total} done",
  "checklist.trialDaysOne": "1 day left in your trial",
  "checklist.trialDaysMany": "{days} days left in your trial",
  "checklist.dismiss": "Hide this checklist",
  "checklist.stepDone": "Done",
  "checklist.stepBlocked": "Add a startup first",

  "checklist.step1.title": "Add the first startup you're evaluating",
  "checklist.step1.body": "Every startup you add is scored on the same 8-dimension rubric, so you compare on evidence rather than pitch polish.",
  "checklist.step1.cta": "Add a startup",

  "checklist.step2.title": "Run your included Trust BizReport",
  "checklist.step2.body": "One full report is included: 13 criteria, an AUD valuation range and a next-step plan, ready in a few minutes.",
  "checklist.step2.cta": "Run the report",

  "checklist.step3.title": "Set your thesis so matching founders can find you",
  "checklist.step3.body": "Pick your sectors and switch on discoverability, and founders whose profile fits your thesis can request an intro.",
  "checklist.step3.cta": "Set my thesis",

  "checklist.step4.title": "Add a startup to your watchlist / cohort",
  "checklist.step4.body": "A second startup is where one rubric pays off: the weekly Progress Radar shows who moved and whose deadline is next.",
  "checklist.step4.cta": "Add another startup",

  // ── Trial-end reminder (T-3d email) ───────────────────────────────────
  "reminder.reportWaiting": "Your included Trust BizReport is still waiting — run it before {trial_end}.",
  "reminder.reportWaitingCta": "Run it now",
} as const;

export type EvaluationsCopyKey = keyof typeof EVALUATIONS_COPY;

/** Read one string, filling `{tokens}`. */
export function evaluationsCopy(key: EvaluationsCopyKey, tokens: CopyTokens = {}): string {
  return fill(EVALUATIONS_COPY[key], tokens);
}

/** "1 day left in your trial" / "{n} days left in your trial". */
export function trialDaysLeftLine(days: number): string {
  return days === 1 ? EVALUATIONS_COPY["checklist.trialDaysOne"] : fill(EVALUATIONS_COPY["checklist.trialDaysMany"], { days });
}
