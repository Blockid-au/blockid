// Colocated vitest for the signup gate.
//
// The properties pinned here are commercial, not cosmetic. Each one, if it
// regressed, would either burn model spend on visitors who will never convert
// or block someone who was about to pay us:
//
//   * run 1 is UNWALLED — the first anonymous run must never be gated;
//   * a signed-in caller is never gated, whatever the anon count says;
//   * `?tier=paid` with a sellable input is never gated — that visitor is on
//     their way to the A$3 checkout;
//   * `?tier=paid` with a typed idea IS gated, because there is no A$3 SKU
//     for a typed idea and the flag would otherwise be a free bypass;
//   * the gated decision carries a machine-readable reason plus the real
//     counts, so the UI never has to invent copy.

import { describe, expect, it } from "vitest";
import {
  ANON_RUN_WINDOW_DAYS,
  ANON_RUN_WINDOW_MS,
  anonRunWindowStart,
  decideSignupGate,
  FREE_ANON_RUNS,
  isPaidSellableInput,
  SIGNUP_REQUIRED,
} from "./signup-gate";

describe("signup gate — the first run is never walled", () => {
  it("allows an anonymous visitor with no prior runs", () => {
    const d = decideSignupGate({ authenticated: false, priorRuns: 0 });
    expect(d.allow).toBe(true);
    expect(d.reason).toBe("first_run");
  });

  it("keeps the free allowance at exactly one run", () => {
    expect(FREE_ANON_RUNS).toBe(1);
  });

  it("gates the second anonymous run", () => {
    const d = decideSignupGate({ authenticated: false, priorRuns: 1 });
    expect(d.allow).toBe(false);
    expect(d.reason).toBe(SIGNUP_REQUIRED);
  });
});

describe("signup gate — signed in is never gated", () => {
  it("allows a session user with many prior runs", () => {
    const d = decideSignupGate({ authenticated: true, priorRuns: 99 });
    expect(d.allow).toBe(true);
    expect(d.reason).toBe("authenticated");
  });

  it("prefers the session over the paid tier flag", () => {
    const d = decideSignupGate({
      authenticated: true,
      priorRuns: 5,
      tier: "paid",
      paidSellable: true,
    });
    expect(d.reason).toBe("authenticated");
  });
});

describe("signup gate — the A$3 guest path is never walled", () => {
  it("allows a paid guest with a sellable input", () => {
    const d = decideSignupGate({
      authenticated: false,
      priorRuns: 7,
      tier: "paid",
      paidSellable: true,
    });
    expect(d.allow).toBe(true);
    expect(d.reason).toBe("paid_guest");
  });

  it("gates ?tier=paid when the input has no A$3 SKU", () => {
    const d = decideSignupGate({
      authenticated: false,
      priorRuns: 3,
      tier: "paid",
      paidSellable: false,
    });
    expect(d.allow).toBe(false);
  });

  it("still allows the paid guest's FIRST run", () => {
    const d = decideSignupGate({
      authenticated: false,
      priorRuns: 0,
      tier: "paid",
      paidSellable: false,
    });
    expect(d.allow).toBe(true);
  });
});

describe("signup gate — the gated response carries real numbers", () => {
  it("reports the prior run count and the window", () => {
    const d = decideSignupGate({ authenticated: false, priorRuns: 4 });
    expect(d).toEqual({
      allow: false,
      reason: SIGNUP_REQUIRED,
      priorRuns: 4,
      windowDays: ANON_RUN_WINDOW_DAYS,
    });
  });

  it("treats a junk count as zero rather than throwing", () => {
    expect(
      decideSignupGate({ authenticated: false, priorRuns: Number.NaN }).allow,
    ).toBe(true);
    expect(
      decideSignupGate({ authenticated: false, priorRuns: -3 }).allow,
    ).toBe(true);
  });
});

describe("signup gate — the counting window", () => {
  it("is a rolling 30 days, not all time", () => {
    expect(ANON_RUN_WINDOW_DAYS).toBe(30);
    expect(ANON_RUN_WINDOW_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("produces an ISO cutoff one window back", () => {
    const now = Date.UTC(2026, 8, 8, 0, 0, 0);
    expect(anonRunWindowStart(now)).toBe(
      new Date(now - ANON_RUN_WINDOW_MS).toISOString(),
    );
  });
});

describe("isPaidSellableInput", () => {
  it("accepts a file", () => {
    expect(isPaidSellableInput({ hasFile: true })).toBe(true);
  });

  it("accepts an https URL in either field", () => {
    expect(isPaidSellableInput({ url: "https://example.com" })).toBe(true);
    expect(isPaidSellableInput({ text: "http://example.com" })).toBe(true);
  });

  it("rejects a typed idea", () => {
    expect(
      isPaidSellableInput({ text: "a marketplace for surplus concrete" }),
    ).toBe(false);
  });

  it("rejects a non-http scheme", () => {
    expect(isPaidSellableInput({ text: "javascript:alert(1)" })).toBe(false);
    expect(isPaidSellableInput({ url: "file:///etc/passwd" })).toBe(false);
  });

  it("rejects empty input", () => {
    expect(isPaidSellableInput({})).toBe(false);
    expect(isPaidSellableInput({ text: "   " })).toBe(false);
  });
});
