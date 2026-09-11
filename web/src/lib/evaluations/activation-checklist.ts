// Evaluator activation checklist — state derivation (G12 S13-A).
//
// After the card-required signup an evaluator lands on /workspace/evaluations
// with an empty list; this module turns what the server already knows into
// the 4 activation steps the client renders under the S7-C trial banner
// (plan §6 KPIs: trial→Scout ≥ 15 %, ≥ 4 reports / evaluator / month):
//
//   1. add the first startup            — ≥ 1 evaluation
//   2. run the included Trust BizReport — ≥ 1 evaluation_reports row
//   3. set the thesis                   — ≥ 1 sector AND investor_discoverable
//   4. add a second startup             — ≥ 2 evaluations
//
// Pure — no React, no `server-only` — so the page can compute inputs on the
// server, the client can re-derive from live counts after an add / run, and
// the colocated test pins every branch without rendering.

export const ACTIVATION_STEP_COUNT = 4 as const;

export type ActivationStepNumber = 1 | 2 | 3 | 4;

/** What the CTA does — the client maps these to the existing dialogs / link. */
export type ActivationAction = "add_startup" | "run_report" | "set_thesis";

export interface ActivationInputs {
  /** Rows in `evaluations` for the user. */
  evaluations: number;
  /** Rows in `evaluation_reports` for the user (any kind). */
  reports: number;
  /** `investor_prefs.sectors.length`. */
  sectors: number;
  /** `app_users.investor_discoverable` (getInvestorVisibility().discoverable). */
  discoverable: boolean;
}

export interface ActivationStep {
  step: ActivationStepNumber;
  action: ActivationAction;
  done: boolean;
  /**
   * True when the step cannot be started yet (step 2 needs an evaluation to
   * run the report on) — the client renders a hint instead of a CTA.
   */
  blocked: boolean;
}

export interface ActivationState {
  steps: readonly ActivationStep[];
  completed: number;
  total: typeof ACTIVATION_STEP_COUNT;
  /** All 4 done — the client hides the whole checklist. */
  complete: boolean;
  /** First undone step (the primary CTA), null when complete. */
  next: ActivationStepNumber | null;
}

/** Where step 3 sends the evaluator. */
export const ACTIVATION_THESIS_HREF = "/workspace/investor/preferences";

/** localStorage flag for a dismissed checklist (per browser; try/catch on every access). */
export const ACTIVATION_DISMISS_KEY = "blockid.evaluator.checklist.dismissed.v1";

/** `?from=` value the trial-end reminder deep link carries. */
export const TRIAL_REMINDER_FROM = "trial_reminder";

/** Deep link used by the T-3d reminder email (auto-opens the report dialog on the first evaluation). */
export const TRIAL_REMINDER_PATH = `/workspace/evaluations?from=${TRIAL_REMINDER_FROM}`;

const nonNeg = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

export function deriveActivationChecklist(input: ActivationInputs): ActivationState {
  const evaluations = nonNeg(input.evaluations);
  const reports = nonNeg(input.reports);
  const sectors = nonNeg(input.sectors);
  const discoverable = input.discoverable === true;

  const steps: ActivationStep[] = [
    { step: 1, action: "add_startup", done: evaluations >= 1, blocked: false },
    { step: 2, action: "run_report", done: reports >= 1, blocked: evaluations < 1 },
    { step: 3, action: "set_thesis", done: sectors >= 1 && discoverable, blocked: false },
    { step: 4, action: "add_startup", done: evaluations >= 2, blocked: false },
  ];
  const completed = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done)?.step ?? null;
  return { steps, completed, total: ACTIVATION_STEP_COUNT, complete: completed === ACTIVATION_STEP_COUNT, next };
}

// ---------------------------------------------------------------------------
// Dismissal — a Storage-like duck so the client passes window.localStorage
// and the test passes a Map-backed stub. Every access is wrapped: private
// mode / blocked storage / SSR must read as "not dismissed" and never throw.
// ---------------------------------------------------------------------------

export interface DismissStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readChecklistDismissed(storage: DismissStorage | null | undefined): boolean {
  try {
    return storage?.getItem(ACTIVATION_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeChecklistDismissed(storage: DismissStorage | null | undefined): boolean {
  try {
    storage?.setItem(ACTIVATION_DISMISS_KEY, "1");
    return true;
  } catch {
    return false;
  }
}
