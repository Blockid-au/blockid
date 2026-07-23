// Unit tests for the onboarding wizard reducer — specifically the Step-6
// transitions added by real-world audit #8. Kept intentionally narrow:
// this file guards the state-machine boundaries around the new step, not
// the pre-existing 5-step logic.
//
// vitest.config.ts globs `src/**/*.test.ts` (see repo root of `web/`).

import { describe, expect, it } from "vitest";
import {
  wizardReducer,
  WIZARD_TOTAL_STEPS,
  type WizardState,
} from "./wizard-types";

const base: WizardState = { step: 1 };

describe("wizardReducer — Step 6 (real-world audit #8)", () => {
  it("exposes 6 as the total step count", () => {
    expect(WIZARD_TOTAL_STEPS).toBe(6);
  });

  it("advances from step 5 to step 6 on NEXT", () => {
    const next = wizardReducer({ ...base, step: 5 }, { type: "NEXT" });
    expect(next.step).toBe(6);
    expect(next.error).toBeUndefined();
  });

  it("clamps NEXT at step 6 (does not overflow)", () => {
    const next = wizardReducer({ ...base, step: 6 }, { type: "NEXT" });
    expect(next.step).toBe(6);
  });

  it("supports BACK from step 6 to step 5", () => {
    const next = wizardReducer({ ...base, step: 6 }, { type: "BACK" });
    expect(next.step).toBe(5);
  });

  it("supports GO_TO step 6 directly (magic-link resume)", () => {
    const next = wizardReducer(base, { type: "GO_TO", step: 6 });
    expect(next.step).toBe(6);
  });

  it("records first-startup completion with timestamp + optional projectId", () => {
    const createdAt = "2026-07-23T12:00:00.000Z";
    const next = wizardReducer(
      { ...base, step: 6 },
      { type: "SET_FIRST_STARTUP", createdAt, projectId: "prj_abc" },
    );
    expect(next.firstStartupCreatedAt).toBe(createdAt);
    expect(next.firstStartupId).toBe("prj_abc");
    // The action itself does NOT advance the step — the client redirects
    // to /dashboard after saving. See step-first-startup.tsx handleSubmit.
    expect(next.step).toBe(6);
  });

  it("records the skip path with a timestamp but no projectId", () => {
    const createdAt = "2026-07-23T12:00:00.000Z";
    const next = wizardReducer(
      { ...base, step: 6 },
      { type: "SET_FIRST_STARTUP", createdAt },
    );
    expect(next.firstStartupCreatedAt).toBe(createdAt);
    expect(next.firstStartupId).toBeUndefined();
  });

  it("preserves prior state fields when stamping first-startup completion", () => {
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
