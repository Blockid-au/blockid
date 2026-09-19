// G16-A — funnel emit helpers. Pins:
//   - funnelEventId is a valid uuid (v5 nibble, RFC variant) and deterministic;
//   - sign_up / first svi_analyze / svi_score_computed / checkout carry a
//     deterministic event_id (idempotent on retry), repeat svi_analyze and
//     report_view do not;
//   - `qa: true` is stamped for qa-live-* accounts and absent otherwise;
//   - resolveReportTier: plan > paid order > free, and never throws.

import { beforeEach, describe, expect, it, vi } from "vitest";

const emitEventMock = vi.fn(async () => {});
vi.mock("./server", () => ({ emitEvent: (i: unknown) => emitEventMock(i) }));

import {
  emitCheckout,
  emitReportView,
  emitScoreComputed,
  emitSignUp,
  emitSviAnalyze,
  funnelEventId,
  resolveReportTier,
} from "./funnel";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const QA = "qa-live-20260919-0415@blockid.au";

async function last(): Promise<Record<string, unknown>> {
  await new Promise((r) => setTimeout(r, 0));
  const calls = emitEventMock.mock.calls as unknown as Array<[Record<string, unknown>]>;
  return calls[calls.length - 1][0];
}

beforeEach(() => emitEventMock.mockClear());

describe("funnelEventId", () => {
  it("is a uuid and deterministic per (step, key)", () => {
    const a = funnelEventId("sign_up", "u1");
    expect(a).toMatch(UUID_RE);
    expect(funnelEventId("sign_up", "u1")).toBe(a);
    expect(funnelEventId("sign_up", "u2")).not.toBe(a);
    expect(funnelEventId("svi_analyze_first", "u1")).not.toBe(a);
  });
});

describe("emitSignUp", () => {
  it("stamps method/segment, a deterministic id keyed on the user, and qa for QA accounts", async () => {
    emitSignUp({ userId: "u1", email: QA, method: "google", persona: "founder" });
    const e = await last();
    expect(e.name).toBe("sign_up");
    expect(e.params).toEqual({ segment: "unknown", method: "google", persona: "founder", qa: true });
    expect(e.userId).toBe("u1");
    expect(e.eventId).toBe(funnelEventId("sign_up", "u1"));
  });

  it("no qa flag for a real founder", async () => {
    emitSignUp({ userId: "u2", email: "jane@example.com", method: "email", segment: "founder" });
    const e = await last();
    expect(e.params).toEqual({ segment: "founder", method: "email" });
  });
});

describe("emitSviAnalyze", () => {
  it("first run for a user is idempotent on the user id", async () => {
    emitSviAnalyze({ userId: "u1", email: "a@b.co", projectId: "p1", first: true, score: 61.2, analysisId: "an1" });
    const e = await last();
    expect(e.name).toBe("svi_analyze");
    expect(e.params).toEqual({ project_id: "p1", first: true, score: 61.2, analysis_id: "an1" });
    expect(e.eventId).toBe(funnelEventId("svi_analyze_first", "u1"));
  });

  it("anonymous first run keys on the session; repeat runs get no fixed id", async () => {
    emitSviAnalyze({ userId: null, sessionId: "anon-1", first: true, analysisId: "an2" });
    const a = await last();
    expect(a.eventId).toBe(funnelEventId("svi_analyze_first", "anon-1"));
    expect(a.params).toEqual({ project_id: "an2", first: true, analysis_id: "an2" });
    expect(a.sessionId).toBe("anon-1");
    emitSviAnalyze({ userId: "u1", email: QA, projectId: "p1", first: false });
    const b = await last();
    expect(b.eventId).toBeUndefined();
    expect(b.params).toEqual({ project_id: "p1", first: false, qa: true });
  });
});

describe("emitScoreComputed / emitReportView / emitCheckout", () => {
  it("score is keyed on the analysis id (slug fallback)", async () => {
    emitScoreComputed({ userId: "u1", projectId: "p1", score: 55, slug: "svi-abc", analysisId: "an1" });
    const e = await last();
    expect(e.name).toBe("svi_score_computed");
    expect(e.params).toEqual({ project_id: "p1", score: 55, slug: "svi-abc", user_id: "u1", analysis_id: "an1" });
    expect(e.eventId).toBe(funnelEventId("svi_score_computed", "an1"));
    emitScoreComputed({ userId: null, projectId: "p1", score: 55, slug: "svi-abc" });
    expect((await last()).eventId).toBe(funnelEventId("svi_score_computed", "svi-abc"));
  });

  it("report_view carries tier + project and no fixed id", async () => {
    emitReportView({ userId: "u1", email: QA, projectId: "default", tier: "free", pagesEst: 10 });
    const e = await last();
    expect(e.name).toBe("report_view");
    expect(e.params).toEqual({ tier: "free", project_id: "default", pages_est: 10, qa: true });
    expect(e.eventId).toBeUndefined();
  });

  it("checkout is keyed on the Stripe session id", async () => {
    emitCheckout({ userId: "u1", email: "a@b.co", sku: "trust_report_5aud", amountCents: 300, projectId: "biz1", orderId: "o1", stripeSessionId: "cs_test_1" });
    const e = await last();
    expect(e.name).toBe("checkout");
    expect(e.params).toEqual({ sku: "trust_report_5aud", amount_cents: 300, project_id: "biz1", order_id: "o1" });
    expect(e.eventId).toBe(funnelEventId("checkout", "cs_test_1"));
  });
});

describe("resolveReportTier", () => {
  function client(count: number | null, error: { message: string } | null = null, throws = false) {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: () => {
              if (throws) throw new Error("boom");
              return Promise.resolve({ count, error });
            },
          }),
        }),
      }),
    };
  }

  it("plan wins, then a paid order, else free; failures are free", async () => {
    expect(await resolveReportTier(client(3), "u1", "founder_pro")).toBe("plan");
    expect(await resolveReportTier(client(3), "u1", "free")).toBe("paid");
    expect(await resolveReportTier(client(0), "u1", null)).toBe("free");
    expect(await resolveReportTier(client(null, { message: "42P01" }), "u1", "")).toBe("free");
    expect(await resolveReportTier(client(1, null, true), "u1", "free")).toBe("free");
    expect(await resolveReportTier(null, "u1", "free")).toBe("free");
  });
});
