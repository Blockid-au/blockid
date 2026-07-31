import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isInTrial,
  daysRemaining,
  trialSummary,
  type SubscriptionTrialState,
  type TrialStatus,
} from "./trial";

// A fixed "now" the whole file pivots around so daysRemaining math is
// deterministic across environments/clocks. Chosen mid-day UTC to avoid
// off-by-one flakes on hosts running a non-UTC system timezone.
const FROZEN_NOW = new Date("2026-08-15T12:00:00.000Z");

const DAY_MS = 24 * 60 * 60 * 1000;

function makeState(
  overrides: Partial<SubscriptionTrialState> = {},
): SubscriptionTrialState {
  return {
    user_id: "user_1",
    stripe_subscription_id: "sub_test_1",
    plan_id: "growth",
    trial_start: new Date(FROZEN_NOW.getTime() - 3 * DAY_MS).toISOString(),
    trial_end: new Date(FROZEN_NOW.getTime() + 7 * DAY_MS).toISOString(),
    status: "trialing",
    payment_method_id: null,
    reminder_sent: {},
    updated_at: FROZEN_NOW.toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isInTrial", () => {
  it("returns false for null state (no subscription row)", () => {
    expect(isInTrial(null)).toBe(false);
  });

  it("returns true when status='trialing' and trial_end is in the future (ISO string)", () => {
    expect(isInTrial(makeState())).toBe(true);
  });

  it("returns true when trial_end is a Date object in the future", () => {
    const state = makeState({
      trial_end: new Date(FROZEN_NOW.getTime() + DAY_MS),
    });
    expect(isInTrial(state)).toBe(true);
  });

  it("returns false when status='trialing' but trial_end is in the past", () => {
    const state = makeState({
      trial_end: new Date(FROZEN_NOW.getTime() - DAY_MS).toISOString(),
    });
    expect(isInTrial(state)).toBe(false);
  });

  it("returns false when trial_end === now (strict > check, not >=)", () => {
    const state = makeState({ trial_end: FROZEN_NOW.toISOString() });
    expect(isInTrial(state)).toBe(false);
  });

  it.each<TrialStatus>(["active", "past_due", "canceled", "ended"])(
    "returns false for non-trialing status '%s' even with a future trial_end",
    (status) => {
      const state = makeState({ status });
      expect(isInTrial(state)).toBe(false);
    },
  );

  it("returns false when trial_end is an unparseable string", () => {
    const state = makeState({ trial_end: "not-a-date" });
    expect(isInTrial(state)).toBe(false);
  });

  it("returns false when trial_end is a Date whose time is NaN", () => {
    const state = makeState({ trial_end: new Date("bogus") });
    expect(isInTrial(state)).toBe(false);
  });
});

describe("daysRemaining", () => {
  it("returns 0 for null input", () => {
    expect(daysRemaining(null)).toBe(0);
  });

  it("returns 0 when trial_end is in the past", () => {
    expect(
      daysRemaining(new Date(FROZEN_NOW.getTime() - DAY_MS).toISOString()),
    ).toBe(0);
  });

  it("returns 0 when trial_end === now (ms <= 0 branch)", () => {
    expect(daysRemaining(FROZEN_NOW.toISOString())).toBe(0);
  });

  it("returns 7 for a trial_end 7 whole days in the future", () => {
    expect(
      daysRemaining(new Date(FROZEN_NOW.getTime() + 7 * DAY_MS).toISOString()),
    ).toBe(7);
  });

  it("accepts a Date object as input", () => {
    expect(
      daysRemaining(new Date(FROZEN_NOW.getTime() + 3 * DAY_MS)),
    ).toBe(3);
  });

  it("rounds up fractional remaining days (ceiling)", () => {
    // 1.5 days from now → ceil to 2
    expect(
      daysRemaining(new Date(FROZEN_NOW.getTime() + 1.5 * DAY_MS)),
    ).toBe(2);
  });

  it("returns 1 for any ms > 0 but less than a day (ceiling of a small positive)", () => {
    expect(daysRemaining(new Date(FROZEN_NOW.getTime() + 60 * 1000))).toBe(1);
  });

  it("returns 0 for an unparseable string", () => {
    expect(daysRemaining("also-not-a-date")).toBe(0);
  });

  it("returns 0 for a Date whose time is NaN", () => {
    expect(daysRemaining(new Date("still-bogus"))).toBe(0);
  });

  it("handles a distant-future trial_end without overflow (30 days)", () => {
    expect(
      daysRemaining(new Date(FROZEN_NOW.getTime() + 30 * DAY_MS)),
    ).toBe(30);
  });
});

describe("trialSummary", () => {
  it("returns the zero/null summary when state is null (user irrelevant)", () => {
    expect(trialSummary(null, null)).toEqual({
      inTrial: false,
      daysLeft: 0,
      endsAt: null,
      requiresPayment: false,
      status: null,
      planId: null,
    });
  });

  it("echoes plan_id and status from an active-trial state and reports daysLeft", () => {
    const state = makeState({
      plan_id: "founding50",
      status: "trialing",
      trial_end: new Date(FROZEN_NOW.getTime() + 5 * DAY_MS).toISOString(),
    });
    const s = trialSummary(null, state);
    expect(s.inTrial).toBe(true);
    expect(s.daysLeft).toBe(5);
    expect(s.status).toBe("trialing");
    expect(s.planId).toBe("founding50");
    expect(s.requiresPayment).toBe(false);
  });

  it("populates endsAt as a Date reflecting the exact trial_end", () => {
    const end = new Date(FROZEN_NOW.getTime() + 2 * DAY_MS);
    const s = trialSummary(null, makeState({ trial_end: end.toISOString() }));
    expect(s.endsAt).toBeInstanceOf(Date);
    expect(s.endsAt?.toISOString()).toBe(end.toISOString());
  });

  it("populates endsAt when trial_end is passed as a Date object", () => {
    const end = new Date(FROZEN_NOW.getTime() + 4 * DAY_MS);
    const s = trialSummary(null, makeState({ trial_end: end }));
    expect(s.endsAt?.getTime()).toBe(end.getTime());
  });

  it("sets endsAt=null when trial_end is unparseable but keeps status/plan echo", () => {
    const s = trialSummary(
      null,
      makeState({ trial_end: "garbage", status: "canceled", plan_id: "free" }),
    );
    expect(s.endsAt).toBeNull();
    expect(s.status).toBe("canceled");
    expect(s.planId).toBe("free");
    expect(s.inTrial).toBe(false);
    expect(s.daysLeft).toBe(0);
  });

  it("flips requiresPayment=true when in-trial + daysLeft<=1 + no payment method", () => {
    const state = makeState({
      trial_end: new Date(FROZEN_NOW.getTime() + 6 * 60 * 60 * 1000), // 6h left
      payment_method_id: null,
    });
    const s = trialSummary(null, state);
    expect(s.inTrial).toBe(true);
    expect(s.daysLeft).toBe(1);
    expect(s.requiresPayment).toBe(true);
  });

  it("keeps requiresPayment=false when trial has <=1 day left BUT a payment method is captured", () => {
    const state = makeState({
      trial_end: new Date(FROZEN_NOW.getTime() + 6 * 60 * 60 * 1000),
      payment_method_id: "pm_test_123",
    });
    const s = trialSummary(null, state);
    expect(s.inTrial).toBe(true);
    expect(s.requiresPayment).toBe(false);
  });

  it("treats an empty-string payment_method_id as falsy — requiresPayment=true", () => {
    const state = makeState({
      trial_end: new Date(FROZEN_NOW.getTime() + 60 * 1000),
      payment_method_id: "",
    });
    const s = trialSummary(null, state);
    expect(s.requiresPayment).toBe(true);
  });

  it("keeps requiresPayment=false when >1 day remains (even with no payment method)", () => {
    const state = makeState({
      trial_end: new Date(FROZEN_NOW.getTime() + 3 * DAY_MS),
      payment_method_id: null,
    });
    const s = trialSummary(null, state);
    expect(s.daysLeft).toBe(3);
    expect(s.requiresPayment).toBe(false);
  });

  it("keeps requiresPayment=false when the trial has already ended (inTrial=false)", () => {
    const state = makeState({
      trial_end: new Date(FROZEN_NOW.getTime() - DAY_MS).toISOString(),
      payment_method_id: null,
    });
    const s = trialSummary(null, state);
    expect(s.inTrial).toBe(false);
    expect(s.daysLeft).toBe(0);
    expect(s.requiresPayment).toBe(false);
  });

  it.each<TrialStatus>(["active", "past_due", "canceled", "ended"])(
    "status='%s' → inTrial=false and requiresPayment=false regardless of trial_end",
    (status) => {
      const state = makeState({ status, payment_method_id: null });
      const s = trialSummary(null, state);
      expect(s.inTrial).toBe(false);
      expect(s.requiresPayment).toBe(false);
      expect(s.status).toBe(status);
    },
  );

  it("does not mutate the input state (defensive — used as read-only DB row)", () => {
    const state = makeState();
    const before = JSON.parse(JSON.stringify(state));
    trialSummary(null, state);
    expect(state).toEqual(before);
  });

  it("boundary: daysLeft is 1 when exactly one day remains, requiresPayment=true w/o PM", () => {
    // Exactly 1 day + 1ms remaining floors to daysLeft=2 via ceil, so pin the
    // <=1 gate at the point ceil returns 1 (any time within the final 24h).
    const state = makeState({
      trial_end: new Date(FROZEN_NOW.getTime() + DAY_MS - 1),
      payment_method_id: null,
    });
    const s = trialSummary(null, state);
    expect(s.daysLeft).toBe(1);
    expect(s.requiresPayment).toBe(true);
  });
});
