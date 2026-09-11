// Colocated vitest for the evaluator activation checklist derivation (S13-A).
// Pins: the 4 steps and their done rules, step 2 blocked without an
// evaluation, progress / next / complete, garbage-tolerant inputs, the
// dismiss storage helpers (try/catch, SSR-safe) and the reminder deep link.

import { describe, expect, it } from "vitest";
import {
  ACTIVATION_DISMISS_KEY,
  ACTIVATION_STEP_COUNT,
  ACTIVATION_THESIS_HREF,
  TRIAL_REMINDER_FROM,
  TRIAL_REMINDER_PATH,
  deriveActivationChecklist,
  readChecklistDismissed,
  writeChecklistDismissed,
  type ActivationInputs,
} from "./activation-checklist";

const EMPTY: ActivationInputs = { evaluations: 0, reports: 0, sectors: 0, discoverable: false };

describe("deriveActivationChecklist", () => {
  it("fresh evaluator: 0 of 4, step 1 next, step 2 blocked until a startup exists", () => {
    const s = deriveActivationChecklist(EMPTY);
    expect(s.total).toBe(ACTIVATION_STEP_COUNT);
    expect(s.steps.map((x) => x.step)).toEqual([1, 2, 3, 4]);
    expect(s.steps.map((x) => x.action)).toEqual(["add_startup", "run_report", "set_thesis", "add_startup"]);
    expect(s.steps.map((x) => x.done)).toEqual([false, false, false, false]);
    expect(s.steps[1].blocked).toBe(true);
    expect(s.steps.filter((x) => x.blocked).map((x) => x.step)).toEqual([2]);
    expect(s.completed).toBe(0);
    expect(s.next).toBe(1);
    expect(s.complete).toBe(false);
  });

  it("one evaluation ticks step 1 and unblocks step 2 (next = 2); a report ticks step 2", () => {
    let s = deriveActivationChecklist({ ...EMPTY, evaluations: 1 });
    expect(s.steps.map((x) => x.done)).toEqual([true, false, false, false]);
    expect(s.steps[1].blocked).toBe(false);
    expect(s.next).toBe(2);
    expect(s.completed).toBe(1);

    s = deriveActivationChecklist({ ...EMPTY, evaluations: 1, reports: 1 });
    expect(s.steps.map((x) => x.done)).toEqual([true, true, false, false]);
    expect(s.next).toBe(3);
    expect(s.completed).toBe(2);
  });

  it("step 3 needs BOTH ≥ 1 sector AND discoverable", () => {
    expect(deriveActivationChecklist({ ...EMPTY, sectors: 2 }).steps[2].done).toBe(false);
    expect(deriveActivationChecklist({ ...EMPTY, discoverable: true }).steps[2].done).toBe(false);
    expect(deriveActivationChecklist({ ...EMPTY, sectors: 1, discoverable: true }).steps[2].done).toBe(true);
  });

  it("step 4 needs a second evaluation; steps can complete out of order (next = first undone)", () => {
    const s = deriveActivationChecklist({ evaluations: 2, reports: 0, sectors: 1, discoverable: true });
    expect(s.steps.map((x) => x.done)).toEqual([true, false, true, true]);
    expect(s.completed).toBe(3);
    expect(s.next).toBe(2);
    expect(s.complete).toBe(false);
  });

  it("all 4 done → complete, next = null", () => {
    const s = deriveActivationChecklist({ evaluations: 3, reports: 2, sectors: 1, discoverable: true });
    expect(s.completed).toBe(4);
    expect(s.complete).toBe(true);
    expect(s.next).toBeNull();
  });

  it("tolerates garbage counts (negative / NaN / fractional / non-boolean)", () => {
    const s = deriveActivationChecklist({
      evaluations: -3,
      reports: Number.NaN,
      sectors: 0.4,
      discoverable: "yes" as unknown as boolean,
    });
    expect(s.completed).toBe(0);
    expect(s.steps[2].done).toBe(false);
    expect(deriveActivationChecklist({ ...EMPTY, evaluations: 1.9 }).steps[0].done).toBe(true);
  });

  it("constants: thesis link, dismiss key, reminder deep link", () => {
    expect(ACTIVATION_THESIS_HREF).toBe("/workspace/investor/preferences");
    expect(ACTIVATION_DISMISS_KEY).toBe("blockid.evaluator.checklist.dismissed.v1");
    expect(TRIAL_REMINDER_FROM).toBe("trial_reminder");
    expect(TRIAL_REMINDER_PATH).toBe("/workspace/evaluations?from=trial_reminder");
  });
});

describe("dismiss storage helpers", () => {
  function mapStorage() {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), map: m };
  }

  it("reads false when unset / null storage (SSR), true after write", () => {
    const st = mapStorage();
    expect(readChecklistDismissed(st)).toBe(false);
    expect(readChecklistDismissed(null)).toBe(false);
    expect(readChecklistDismissed(undefined)).toBe(false);
    expect(writeChecklistDismissed(st)).toBe(true);
    expect(st.map.get(ACTIVATION_DISMISS_KEY)).toBe("1");
    expect(readChecklistDismissed(st)).toBe(true);
    // Only the exact "1" flag counts.
    st.map.set(ACTIVATION_DISMISS_KEY, "true");
    expect(readChecklistDismissed(st)).toBe(false);
  });

  it("never throws when storage is blocked (private mode / quota)", () => {
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(readChecklistDismissed(throwing)).toBe(false);
    expect(writeChecklistDismissed(throwing)).toBe(false);
    expect(writeChecklistDismissed(null)).toBe(true);
  });
});
