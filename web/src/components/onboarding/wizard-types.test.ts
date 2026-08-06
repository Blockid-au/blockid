// Colocated same-name test for `wizard-types.ts`.
//
// A sibling `wizard-reducer.test.ts` already exercises the Step-6 slice of
// the reducer, but the loop's test-gate pairs a source file with its
// *same-name* sibling (scripts/cron/test-gate.mjs:60-66) — without this file
// a rewrite of `wizard-types.ts` that stripped, say, the `SET_SEGMENT`
// invalidation or SET_ERROR's `loading:false` reset would land unguarded.
//
// The suite therefore pins the reducer's full public surface: every action
// arm, the clamp bounds (MIN_STEP=1, MAX_STEP=6), the invariants around
// error clearing / loading reset, and input non-mutation. Overlap with the
// sibling file is intentional and cheap.

import { describe, expect, it } from "vitest";
import {
  WIZARD_TOTAL_STEPS,
  wizardReducer,
  type WizardAction,
  type WizardState,
} from "./wizard-types";

const base: WizardState = { step: 1 };

describe("WIZARD_TOTAL_STEPS", () => {
  it("is 6 — the progress indicator's canonical denominator", () => {
    expect(WIZARD_TOTAL_STEPS).toBe(6);
  });
});

describe("wizardReducer — SET_SEGMENT", () => {
  it("sets the segment and clears any goal/plan chosen for the old one", () => {
    const start: WizardState = {
      step: 2,
      segment: "founder",
      goal: "raise_funding",
      planId: "founder_pro",
      error: "prev",
    };
    const next = wizardReducer(start, {
      type: "SET_SEGMENT",
      segment: "investor_angel",
    });
    expect(next.segment).toBe("investor_angel");
    expect(next.goal).toBeUndefined();
    expect(next.planId).toBeUndefined();
    expect(next.error).toBeUndefined();
    // Does not touch step — only the sub-selection is invalidated.
    expect(next.step).toBe(2);
  });

  it("does not mutate the input state object", () => {
    const start: WizardState = {
      step: 2,
      segment: "founder",
      goal: "raise_funding",
      planId: "founder_pro",
    };
    const snapshot = { ...start };
    wizardReducer(start, { type: "SET_SEGMENT", segment: "advisor" });
    expect(start).toEqual(snapshot);
  });
});

describe("wizardReducer — SET_GOAL / SET_PLAN / SET_CONSENT / SET_PAYMENT_METHOD", () => {
  it("SET_GOAL sets goal and clears error, leaves segment/plan alone", () => {
    const start: WizardState = {
      step: 2,
      segment: "founder",
      planId: "founder_pro",
      error: "bad",
    };
    const next = wizardReducer(start, {
      type: "SET_GOAL",
      goal: "raise_funding",
    });
    expect(next.goal).toBe("raise_funding");
    expect(next.error).toBeUndefined();
    expect(next.segment).toBe("founder");
    expect(next.planId).toBe("founder_pro");
  });

  it("SET_PLAN sets planId and clears error", () => {
    const next = wizardReducer(
      { ...base, error: "x" },
      { type: "SET_PLAN", planId: "founder_pro" },
    );
    expect(next.planId).toBe("founder_pro");
    expect(next.error).toBeUndefined();
  });

  it("SET_CONSENT toggles consentGranted true and clears error", () => {
    const next = wizardReducer(
      { ...base, error: "x", consentGranted: false },
      { type: "SET_CONSENT", granted: true },
    );
    expect(next.consentGranted).toBe(true);
    expect(next.error).toBeUndefined();
  });

  it("SET_CONSENT toggles consentGranted false (opt-out) and clears error", () => {
    const next = wizardReducer(
      { ...base, consentGranted: true, error: "x" },
      { type: "SET_CONSENT", granted: false },
    );
    expect(next.consentGranted).toBe(false);
    expect(next.error).toBeUndefined();
  });

  it("SET_PAYMENT_METHOD stores the Stripe pm id and clears error", () => {
    const next = wizardReducer(
      { ...base, error: "x" },
      { type: "SET_PAYMENT_METHOD", pmId: "pm_123" },
    );
    expect(next.paymentMethodId).toBe("pm_123");
    expect(next.error).toBeUndefined();
  });
});

describe("wizardReducer — SET_FIRST_STARTUP", () => {
  it("records createdAt + projectId on the happy path", () => {
    const next = wizardReducer(
      { ...base, step: 6 },
      {
        type: "SET_FIRST_STARTUP",
        createdAt: "2026-07-23T12:00:00.000Z",
        projectId: "prj_abc",
      },
    );
    expect(next.firstStartupCreatedAt).toBe("2026-07-23T12:00:00.000Z");
    expect(next.firstStartupId).toBe("prj_abc");
    expect(next.error).toBeUndefined();
    // Deliberately does not advance the step — client redirects to /dashboard.
    expect(next.step).toBe(6);
  });

  it("records the skip path (createdAt only, no projectId)", () => {
    const next = wizardReducer(
      { ...base, step: 6 },
      { type: "SET_FIRST_STARTUP", createdAt: "2026-07-23T12:00:00.000Z" },
    );
    expect(next.firstStartupCreatedAt).toBe("2026-07-23T12:00:00.000Z");
    expect(next.firstStartupId).toBeUndefined();
  });

  it("preserves the rest of the wizard state (segment/goal/plan/consent/pm)", () => {
    const start: WizardState = {
      step: 6,
      segment: "founder",
      goal: "raise_funding",
      planId: "founder_pro",
      consentGranted: true,
      paymentMethodId: "pm_test_123",
    };
    const next = wizardReducer(start, {
      type: "SET_FIRST_STARTUP",
      createdAt: "2026-07-23T12:00:00.000Z",
      projectId: "prj_abc",
    });
    expect(next.segment).toBe("founder");
    expect(next.goal).toBe("raise_funding");
    expect(next.planId).toBe("founder_pro");
    expect(next.consentGranted).toBe(true);
    expect(next.paymentMethodId).toBe("pm_test_123");
  });
});

describe("wizardReducer — NEXT / BACK (step clamping)", () => {
  it("NEXT advances one step in the middle of the range", () => {
    const next = wizardReducer({ ...base, step: 3 }, { type: "NEXT" });
    expect(next.step).toBe(4);
    expect(next.error).toBeUndefined();
  });

  it("NEXT clamps at MAX_STEP=6 (no overflow)", () => {
    const next = wizardReducer({ ...base, step: 6 }, { type: "NEXT" });
    expect(next.step).toBe(6);
  });

  it("BACK decrements one step", () => {
    const next = wizardReducer({ ...base, step: 4 }, { type: "BACK" });
    expect(next.step).toBe(3);
    expect(next.error).toBeUndefined();
  });

  it("BACK clamps at MIN_STEP=1 (no underflow)", () => {
    const next = wizardReducer({ ...base, step: 1 }, { type: "BACK" });
    expect(next.step).toBe(1);
  });

  it("NEXT + BACK sweep across the full 1→6→1 cycle returns to start", () => {
    let s = { ...base };
    for (let i = 0; i < 5; i += 1) s = wizardReducer(s, { type: "NEXT" });
    expect(s.step).toBe(6);
    for (let i = 0; i < 5; i += 1) s = wizardReducer(s, { type: "BACK" });
    expect(s.step).toBe(1);
  });

  it("NEXT and BACK both clear a pre-existing error", () => {
    const withErr: WizardState = { ...base, step: 3, error: "boom" };
    expect(wizardReducer(withErr, { type: "NEXT" }).error).toBeUndefined();
    expect(wizardReducer(withErr, { type: "BACK" }).error).toBeUndefined();
  });
});

describe("wizardReducer — GO_TO (magic-link resume)", () => {
  it("jumps to the requested step and clears error", () => {
    const next = wizardReducer(
      { ...base, step: 2, error: "x" },
      { type: "GO_TO", step: 5 },
    );
    expect(next.step).toBe(5);
    expect(next.error).toBeUndefined();
  });

  it("GO_TO does not touch other fields", () => {
    const start: WizardState = {
      step: 1,
      segment: "advisor",
      goal: "diligence",
      planId: "advisor_pro",
    };
    const next = wizardReducer(start, { type: "GO_TO", step: 6 });
    expect(next.segment).toBe("advisor");
    expect(next.goal).toBe("diligence");
    expect(next.planId).toBe("advisor_pro");
  });
});

describe("wizardReducer — SET_ERROR / SET_LOADING", () => {
  it("SET_ERROR stores the message and forces loading:false", () => {
    const next = wizardReducer(
      { ...base, loading: true },
      { type: "SET_ERROR", error: "network" },
    );
    expect(next.error).toBe("network");
    expect(next.loading).toBe(false);
  });

  it("SET_ERROR with undefined clears the error but still resets loading", () => {
    const next = wizardReducer(
      { ...base, loading: true, error: "prev" },
      { type: "SET_ERROR" },
    );
    expect(next.error).toBeUndefined();
    expect(next.loading).toBe(false);
  });

  it("SET_LOADING true does NOT clear an existing error", () => {
    const next = wizardReducer(
      { ...base, error: "keep" },
      { type: "SET_LOADING", loading: true },
    );
    expect(next.loading).toBe(true);
    // Intentional: only user-driven actions clear error; the spinner does not.
    expect(next.error).toBe("keep");
  });

  it("SET_LOADING false round-trips", () => {
    const next = wizardReducer(
      { ...base, loading: true },
      { type: "SET_LOADING", loading: false },
    );
    expect(next.loading).toBe(false);
  });
});

describe("wizardReducer — unknown action", () => {
  it("returns the input state unchanged (same reference is fine)", () => {
    const start: WizardState = { step: 3, segment: "founder", error: "keep" };
    const bogus = { type: "NOPE" } as unknown as WizardAction;
    const next = wizardReducer(start, bogus);
    expect(next).toEqual(start);
    expect(next.error).toBe("keep");
  });
});
