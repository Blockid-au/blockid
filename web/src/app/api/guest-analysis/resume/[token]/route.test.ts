// Colocated vitest for GET /api/guest-analysis/resume/[token].
//
// This is the link inside the single abandoned-checkout recovery email. It is
// clicked from an email client by a non-technical founder, so every failure
// path must land on a page rather than a JSON error, and it must never charge
// somebody twice.
//
// Regressions this suite is designed to catch:
//   - a malformed/unknown token producing a 500 or a JSON body instead of a
//     redirect back to the landing page;
//   - re-charging a row that is already paid/analyzing/delivered;
//   - losing the guest_analysis_id metadata (the webhook keys off it — the
//     paid report would never be delivered);
//   - dropping the Stripe idempotency key, so a double-click mints two
//     sessions;
//   - forgetting to clear abandoned_at (the reconciler would immediately
//     re-close a live checkout).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
  return {
    isSupabaseConfiguredMock: vi.fn<() => boolean>(),
    isStripeConfiguredMock: vi.fn<() => boolean>(),
    getSupabaseAdminMock: vi.fn<() => unknown | null>(),
    getStripeMock: vi.fn<() => unknown | null>(),
    createSessionMock:
      vi.fn<(args: Record<string, unknown>, opts?: Record<string, unknown>) => Promise<Record<string, unknown>>>(),
    enforceRateLimitMock: vi.fn<() => unknown | null>(),
  };
});

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => mocks.isSupabaseConfiguredMock(),
  getSupabaseAdmin: () => mocks.getSupabaseAdminMock(),
}));
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => mocks.isStripeConfiguredMock(),
  getStripe: () => mocks.getStripeMock(),
  STRIPE_PRICE_MAP: { one_click_report: "price_one_click" },
}));
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: () => mocks.enforceRateLimitMock(),
}));

import { GET } from "./route";

type Row = Record<string, unknown>;

const state: {
  row: Row | null;
  updates: Array<Row>;
} = { row: null, updates: [] };

function chain() {
  const ctx: { op: "select" | "update"; patch: Row | null } = {
    op: "select",
    patch: null,
  };
  const api: Record<string, unknown> = {
    select: () => api,
    update: (p: Row) => {
      ctx.op = "update";
      ctx.patch = p;
      return api;
    },
    eq: () => api,
    maybeSingle: () => api,
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
      if (ctx.op === "update") {
        state.updates.push(ctx.patch ?? {});
        return Promise.resolve({ data: null, error: null }).then(res, rej);
      }
      return Promise.resolve({ data: state.row, error: null }).then(res, rej);
    },
  };
  return api;
}

const TOKEN = "b".repeat(48);

function call(token = TOKEN) {
  return GET(
    new Request(`https://blockid.au/api/guest-analysis/resume/${token}`),
    { params: Promise.resolve({ token }) },
  );
}

beforeEach(() => {
  state.row = {
    id: "row-1",
    email: "founder@example.com",
    input_type: "website_url",
    input_value: "https://example.com",
    input_filename: null,
    status: "abandoned",
  };
  state.updates = [];
  mocks.isSupabaseConfiguredMock.mockReturnValue(true);
  mocks.isStripeConfiguredMock.mockReturnValue(true);
  mocks.getSupabaseAdminMock.mockReturnValue({ from: () => chain() });
  mocks.getStripeMock.mockReturnValue({
    checkout: {
      sessions: {
        create: (a: Record<string, unknown>, o?: Record<string, unknown>) =>
          mocks.createSessionMock(a, o),
      },
    },
  });
  mocks.createSessionMock.mockResolvedValue({
    id: "cs_live_new",
    url: "https://checkout.stripe.com/c/pay/cs_live_new",
  });
  mocks.enforceRateLimitMock.mockReturnValue(null);
});

afterEach(() => vi.clearAllMocks());

describe("resume", () => {
  it("redirects to a fresh Stripe checkout carrying the same row id", async () => {
    const res = await call();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "https://checkout.stripe.com/c/pay/cs_live_new",
    );

    const args = mocks.createSessionMock.mock.calls[0][0] as Record<string, unknown>;
    const md = args.metadata as Record<string, string>;
    expect(md.guest_analysis_id).toBe("row-1");
    expect(md.scope).toBe("guest_analysis");
    expect(args.customer_email).toBe("founder@example.com");
  });

  it("attaches a Stripe idempotency key so a double-click reuses the session", async () => {
    await call();
    const opts = mocks.createSessionMock.mock.calls[0][1] as Record<string, unknown>;
    expect(String(opts.idempotencyKey)).toMatch(/^bid:guest-resume:/);
  });

  it("returns the row to pending and clears abandoned_at", async () => {
    await call();
    const patch = state.updates.at(0)!;
    expect(patch.status).toBe("pending");
    expect(patch.stripe_session_id).toBe("cs_live_new");
    expect(patch.abandoned_at).toBeNull();
    // The once-only claim is NOT cleared — one email ever, per row.
    expect("recovery_email_sent_at" in patch).toBe(false);
  });

  it("never re-charges a row that is already paid", async () => {
    state.row = { ...(state.row as Row), status: "delivered" };
    const res = await call();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/one-click-report/success");
    expect(mocks.createSessionMock).not.toHaveBeenCalled();
  });

  it("bounces a malformed token to the landing page, not an error", async () => {
    const res = await call("not-a-token");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "https://blockid.au/one-click-report?resume=invalid",
    );
    expect(mocks.createSessionMock).not.toHaveBeenCalled();
  });

  it("bounces an unknown token", async () => {
    state.row = null;
    const res = await call();
    expect(res.headers.get("location")).toContain("resume=invalid");
  });

  it("bounces to the landing page when Stripe fails", async () => {
    mocks.createSessionMock.mockRejectedValue(new Error("stripe down"));
    const res = await call();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("resume=unavailable");
  });
});
