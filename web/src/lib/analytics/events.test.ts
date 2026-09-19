import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// analytics/events — colocated tests for the previously-untested typed
// event registry that fronts every GA4 + Supabase analytics_events emission
// on the platform. The AU-investor-standard measurement plan (see
// docs/plans/atlassian-standard-mapping-goal.md §1 phase 7 P2 gap "GA4
// measurement plan template") requires that (a) the discriminated-union
// name/params envelope survives silent drift, (b) the PII guard rejects
// anything that could leak an email/phone/CC/TFN into GA4, and (c) a
// failed emitEvent never breaks the calling user flow. Pins those three
// invariants + the userId/sessionId/eventId pass-through.
// ---------------------------------------------------------------------------

const emitEventMock = vi.fn(async () => {});

vi.mock("./server", () => ({
  emitEvent: emitEventMock,
}));

import {
  ANON_EMITTABLE_EVENTS,
  AnalyticsEnvelopeSchema,
  CLIENT_EMITTABLE_EVENTS,
  isClientEmittableEvent,
  isQaEmail,
  qaFlag,
  QA_EMAIL_RE,
  trackEvent,
  _internal,
  type AnalyticsEvent,
} from "./events";

describe("AnalyticsEnvelopeSchema", () => {
  it("accepts a bare name and defaults params to {}", () => {
    const parsed = AnalyticsEnvelopeSchema.parse({ name: "sign_up" });
    expect(parsed).toEqual({ name: "sign_up", params: {} });
  });

  it("rejects an empty name", () => {
    expect(() => AnalyticsEnvelopeSchema.parse({ name: "" })).toThrow();
  });

  it("rejects a name longer than 64 chars", () => {
    expect(() =>
      AnalyticsEnvelopeSchema.parse({ name: "x".repeat(65) }),
    ).toThrow();
    expect(() =>
      AnalyticsEnvelopeSchema.parse({ name: "x".repeat(64) }),
    ).not.toThrow();
  });

  it("passes through arbitrary param values (per-event shape is enforced by the TS union, not zod)", () => {
    const parsed = AnalyticsEnvelopeSchema.parse({
      name: "sign_up",
      params: { segment: "founder", method: "email" },
    });
    expect(parsed.params).toEqual({ segment: "founder", method: "email" });
  });
});

describe("_internal.containsPii", () => {
  it("flags PII_FIELDS keys regardless of value", () => {
    expect(_internal.containsPii({ email: "" })).toBe("pii-key:email");
    expect(_internal.containsPii({ phone: 123 })).toBe("pii-key:phone");
    expect(_internal.containsPii({ tfn: null })).toBe("pii-key:tfn");
    expect(_internal.containsPii({ password: "x" })).toBe("pii-key:password");
  });

  it("is case-insensitive on the key name (Email == email)", () => {
    expect(_internal.containsPii({ Email: "n/a" })).toBe("pii-key:Email");
    expect(_internal.containsPii({ MOBILE: "n/a" })).toBe("pii-key:MOBILE");
  });

  it("covers every declared PII_FIELDS entry", () => {
    for (const key of _internal.PII_FIELDS) {
      expect(_internal.containsPii({ [key]: "value" })).toBe(`pii-key:${key}`);
    }
  });

  it("detects an email substring inside a value", () => {
    expect(
      _internal.containsPii({ note: "ping founder@example.com back" }),
    ).toBe("pii-email:note");
  });

  it("detects an AU phone number inside a value", () => {
    expect(_internal.containsPii({ note: "call 0412 345 678" })).toBe(
      "pii-phone:note",
    );
    expect(_internal.containsPii({ note: "call +61298765432" })).toBe(
      "pii-phone:note",
    );
  });

  it("detects a credit-card-shaped number inside a value", () => {
    expect(
      _internal.containsPii({ note: "card 4111 1111 1111 1111 expires" }),
    ).toBe("pii-cc:note");
  });

  it("returns null for a fully clean payload", () => {
    expect(
      _internal.containsPii({
        segment: "founder",
        plan: "founder_pro",
        price_aud: 149,
      }),
    ).toBeNull();
  });

  it("ignores non-string values for regex checks (numbers/booleans/nulls skip)", () => {
    // A phone-shaped NUMBER is not a string, so the phone regex must not
    // fire — the guard is intentionally string-only so `days: 14` etc.
    // don't false-positive.
    expect(
      _internal.containsPii({ price_aud: 149, converted: true, note: null }),
    ).toBeNull();
  });
});

describe("trackEvent", () => {
  beforeEach(() => {
    emitEventMock.mockReset();
    emitEventMock.mockImplementation(async () => {});
  });

  it("forwards a clean event to server.emitEvent and reports ok:true", async () => {
    const result = await trackEvent<Extract<AnalyticsEvent, { name: "sign_up" }>>(
      "sign_up",
      { segment: "founder", method: "email" },
    );
    expect(result).toEqual({ ok: true });
    expect(emitEventMock).toHaveBeenCalledTimes(1);
    expect(emitEventMock).toHaveBeenCalledWith({
      name: "sign_up",
      params: { segment: "founder", method: "email" },
      userId: null,
      sessionId: null,
      eventId: undefined,
    });
  });

  it("passes userId / sessionId / eventId opts straight through the envelope", async () => {
    await trackEvent<Extract<AnalyticsEvent, { name: "subscribe" }>>(
      "subscribe",
      {
        plan: "founder_pro",
        price_aud: 149,
        gst_aud: 14.9,
        interval: "month",
      },
      { userId: "user-123", sessionId: "sess-abc", eventId: "evt-xyz" },
    );
    expect(emitEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        sessionId: "sess-abc",
        eventId: "evt-xyz",
      }),
    );
    // G16-A: source / consentGranted are only forwarded when set, so the
    // emitter's "server" / false defaults still apply to every old caller.
    const first = emitEventMock.mock.calls[0][0] as Record<string, unknown>;
    expect("source" in first).toBe(false);
    expect("consentGranted" in first).toBe(false);
    await trackEvent<Extract<AnalyticsEvent, { name: "paywall_view" }>>(
      "paywall_view",
      { surface: "tbr_unlock_rail", sku: "trust_report_5aud", amount_cents: 300 },
      { sessionId: "anon-1", source: "client", consentGranted: true },
    );
    expect(emitEventMock).toHaveBeenLastCalledWith(expect.objectContaining({ source: "client", consentGranted: true, userId: null }));
  });

  it("rejects an event with a PII key and does NOT call emitEvent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Cast: the real union forbids `email` on cohort_action.detail — we're
    // deliberately smuggling a leak through to prove the guard catches it.
    const result = await trackEvent(
      "cohort_action",
      // deno-fmt-ignore
      { cohort: "wk-31", action: "opened", email: "leak@example.com" } as never,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("pii-key:email");
    expect(emitEventMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("rejects an event whose param VALUE contains an email substring", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await trackEvent(
      "cohort_action",
      { cohort: "wk-31", action: "note:founder@example.com" } as never,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("pii-email:action");
    expect(emitEventMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns ok:false with a reason (never throws) when emitEvent rejects — analytics must not break the caller", async () => {
    emitEventMock.mockRejectedValueOnce(new Error("supabase down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await trackEvent<
      Extract<AnalyticsEvent, { name: "dashboard_view" }>
    >("dashboard_view", { dashboard: "home", segment: "founder" });
    expect(result).toEqual({ ok: false, reason: "supabase down" });
    warn.mockRestore();
  });

  it("returns ok:false with a reason when the envelope fails zod validation", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Empty name violates the z.string().min(1) rule.
    const result = await trackEvent("" as never, {} as never);
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(emitEventMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("defaults an omitted params bag to {} before forwarding", async () => {
    // The union types params as required, but the runtime envelope zod
    // schema defaults it — mimic a legacy caller that forgot the object.
    await trackEvent("session_start" as never, undefined as never);
    expect(emitEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "session_start", params: {} }),
    );
  });
});

// ── G16-A: QA-account flag + client allow-list ──────────────────────────

describe("G16-A isQaEmail / qaFlag", () => {
  it("matches the three live-QA address shapes (case-insensitive, trimmed)", () => {
    for (const e of [
      "qa-live-20260919-0415@blockid.au",
      "qa-live-member-20260919-0415@blockid.au",
      "qa-live-evaluator-20260919-0415@blockid.au",
      "  QA-LIVE-20260919-0415@BLOCKID.AU ",
    ]) {
      expect(isQaEmail(e), e).toBe(true);
      expect(qaFlag(e)).toEqual({ qa: true });
    }
  });

  it("does not match founders, seeded qa-<segment> users or near-misses", () => {
    for (const e of ["jane@example.com", "qa-founder-1@blockid.au", "qa-live-2026091-0415@blockid.au", "qa-live-20260919-0415@blockid.au.evil.com", "", null, undefined]) {
      expect(isQaEmail(e), String(e)).toBe(false);
      expect(qaFlag(e)).toEqual({});
    }
    expect(QA_EMAIL_RE.source).toContain("qa-live-");
  });
});

describe("G16-A CLIENT_EMITTABLE_EVENTS", () => {
  it("is exactly the five browser-emittable funnel events; anon may only send paywall_view / share_link_open", () => {
    expect([...CLIENT_EMITTABLE_EVENTS]).toEqual(["paywall_view", "checkout", "report_view", "dashboard_view", "share_link_open"]);
    expect([...ANON_EMITTABLE_EVENTS]).toEqual(["paywall_view", "share_link_open"]);
    expect(isClientEmittableEvent("paywall_view")).toBe(true);
    expect(isClientEmittableEvent("sign_up")).toBe(false);
    expect(isClientEmittableEvent("trust_report_purchased")).toBe(false);
  });
});
