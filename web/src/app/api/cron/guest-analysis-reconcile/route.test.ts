// Colocated vitest for GET+POST /api/cron/guest-analysis-reconcile.
//
// This cron closes out abandoned A$3 guest checkouts. Two things it does are
// load-bearing and silently expensive to get wrong:
//
//   1. It must ask STRIPE whether money moved — never our own columns.
//      `guest_analyses.amount_paid_aud_cents` is stamped with 300 at session
//      creation, so any code that trusts it will "confirm" payment for people
//      who never paid, and will miss the inverse: a paid session whose
//      webhook we dropped, whose report would then never be delivered.
//   2. The recovery email must be at-most-once. It claims
//      recovery_email_sent_at with a guarded UPDATE ... IS NULL *before*
//      sending; if that claim returns zero rows, nothing may be sent.
//
// Regressions this suite is designed to catch:
//   - dropping the CRON_SECRET gate;
//   - marking a still-open, not-yet-expired session as abandoned (we would
//     email someone mid-card-entry);
//   - failing to run the delivery on a recovered missed webhook (a paying
//     customer's report never arrives);
//   - sending before claiming, or sending when the claim was lost — either
//     turns "one email" into a sequence;
//   - emailing an address that has unsubscribed (Spam Act 2003);
//   - dry-run performing writes or sends.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.CRON_SECRET = "test_cron_secret";
  process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
  return {
    isSupabaseConfiguredMock: vi.fn<() => boolean>(),
    isStripeConfiguredMock: vi.fn<() => boolean>(),
    getSupabaseAdminMock: vi.fn<() => unknown | null>(),
    getStripeMock: vi.fn<() => unknown | null>(),
    retrieveMock: vi.fn<(id: string) => Promise<Record<string, unknown>>>(),
    canSendEmailMock: vi.fn<(e: string, c: string) => Promise<boolean>>(),
    sendRecoveryMock:
      vi.fn<(a: Record<string, unknown>) => Promise<{ ok: boolean; reason?: string }>>(),
    sendTelegramMock: vi.fn<(t: string) => Promise<void>>(),
    runGuestAnalysisMock:
      vi.fn<(id: string) => Promise<{ success: boolean; error?: string }>>(),
  };
});

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => mocks.isSupabaseConfiguredMock(),
  getSupabaseAdmin: () => mocks.getSupabaseAdminMock(),
}));
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => mocks.isStripeConfiguredMock(),
  getStripe: () => mocks.getStripeMock(),
}));
vi.mock("@/lib/email-preferences", () => ({
  canSendEmail: (e: string, c: string) => mocks.canSendEmailMock(e, c),
}));
vi.mock("@/lib/email", () => ({
  sendGuestCheckoutRecovery: (a: Record<string, unknown>) =>
    mocks.sendRecoveryMock(a),
}));
vi.mock("@/lib/telegram", () => ({
  sendTelegram: (t: string) => mocks.sendTelegramMock(t),
}));
vi.mock("@/lib/guest-analysis/runner", () => ({
  runGuestAnalysis: (id: string) => mocks.runGuestAnalysisMock(id),
}));

import { GET, POST } from "./route";

// --- Fake supabase --------------------------------------------------------

type Row = Record<string, unknown>;
interface UpdateCall {
  patch: Row;
  filters: Array<[string, string, unknown]>;
}

const state: {
  pending: Row[];
  abandoned: Row[];
  updates: UpdateCall[];
  /** Queue of results for successive UPDATE ... .select() calls. */
  updateResults: Array<{ data: Row[] | null; error: { message: string } | null }>;
} = { pending: [], abandoned: [], updates: [], updateResults: [] };

function chain() {
  const ctx: {
    op: "select" | "update";
    patch: Row | null;
    filters: Array<[string, string, unknown]>;
  } = { op: "select", patch: null, filters: [] };

  const push = (kind: string, col: string, val: unknown) => {
    ctx.filters.push([kind, col, val]);
    return api;
  };

  const settle = async () => {
    if (ctx.op === "update") {
      state.updates.push({ patch: ctx.patch ?? {}, filters: ctx.filters });
      return (
        state.updateResults.shift() ?? { data: [{ id: "ok" }], error: null }
      );
    }
    const status = ctx.filters.find(
      (f) => f[0] === "eq" && f[1] === "status",
    )?.[2];
    if (status === "pending") return { data: state.pending, error: null };
    if (status === "abandoned") return { data: state.abandoned, error: null };
    return { data: [], error: null };
  };

  const api: Record<string, unknown> = {
    select: () => api,
    update: (p: Row) => {
      ctx.op = "update";
      ctx.patch = p;
      return api;
    },
    eq: (c: string, v: unknown) => push("eq", c, v),
    is: (c: string, v: unknown) => push("is", c, v),
    lt: (c: string, v: unknown) => push("lt", c, v),
    gt: (c: string, v: unknown) => push("gt", c, v),
    order: () => api,
    limit: () => api,
    maybeSingle: () => api,
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      settle().then(res, rej),
  };
  return api;
}

const fakeSupabase = { from: () => chain() };
const fakeStripe = {
  checkout: { sessions: { retrieve: (id: string) => mocks.retrieveMock(id) } },
};

// --- Fixtures -------------------------------------------------------------

const HOURS = 3_600_000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

function pendingRow(over: Row = {}): Row {
  return {
    id: "row-1",
    email: "founder@example.com",
    stripe_session_id: "cs_live_abc",
    created_at: iso(26 * HOURS),
    status: "pending",
    ...over,
  };
}

function abandonedRow(over: Row = {}): Row {
  return {
    id: "row-1",
    email: "founder@example.com",
    input_type: "website_url",
    input_value: "https://example.com",
    input_filename: null,
    abandoned_at: iso(3 * HOURS),
    resume_token: "a".repeat(48),
    ...over,
  };
}

function req(opts: { auth?: boolean; query?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.auth !== false) headers["x-cron-secret"] = "test_cron_secret";
  return new Request(
    `https://blockid.au/api/cron/guest-analysis-reconcile${opts.query ?? ""}`,
    { headers },
  );
}

beforeEach(() => {
  state.pending = [];
  state.abandoned = [];
  state.updates = [];
  state.updateResults = [];
  mocks.isSupabaseConfiguredMock.mockReturnValue(true);
  mocks.isStripeConfiguredMock.mockReturnValue(true);
  mocks.getSupabaseAdminMock.mockReturnValue(fakeSupabase);
  mocks.getStripeMock.mockReturnValue(fakeStripe);
  mocks.canSendEmailMock.mockResolvedValue(true);
  mocks.sendRecoveryMock.mockResolvedValue({ ok: true });
  mocks.sendTelegramMock.mockResolvedValue(undefined);
  mocks.runGuestAnalysisMock.mockResolvedValue({ success: true });
  mocks.retrieveMock.mockReset();
});

afterEach(() => vi.clearAllMocks());

// --- Auth -----------------------------------------------------------------

describe("auth", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await GET(req({ auth: false }));
    expect(res.status).toBe(401);
  });

  it("accepts Authorization: Bearer as well as x-cron-secret", async () => {
    const res = await POST(
      new Request("https://blockid.au/api/cron/guest-analysis-reconcile", {
        method: "POST",
        headers: { authorization: "Bearer test_cron_secret" },
      }),
    );
    expect(res.status).toBe(200);
  });
});

// --- Phase 1: reconcile ---------------------------------------------------

describe("reconcile — Stripe is the only source of payment truth", () => {
  it("marks an expired unpaid session abandoned and mints a resume token", async () => {
    state.pending = [pendingRow()];
    mocks.retrieveMock.mockResolvedValue({
      id: "cs_live_abc",
      status: "expired",
      payment_status: "unpaid",
      expires_at: Math.floor((Date.now() - HOURS) / 1000),
    });

    const body = await (await GET(req())).json();
    expect(body.counts.abandoned).toBe(1);

    const upd = state.updates.at(0)!;
    expect(upd.patch.status).toBe("abandoned");
    expect(upd.patch.abandoned_at).toBeTruthy();
    expect(upd.patch.stripe_session_status).toBe("expired/unpaid");
    expect(String(upd.patch.resume_token)).toMatch(/^[0-9a-f]{48}$/);
    // Guarded so a concurrent webhook flip wins.
    expect(upd.filters).toContainEqual(["eq", "status", "pending"]);
  });

  it("leaves a still-open, not-yet-expired session alone", async () => {
    state.pending = [pendingRow({ created_at: iso(2 * HOURS) })];
    mocks.retrieveMock.mockResolvedValue({
      id: "cs_live_abc",
      status: "open",
      payment_status: "unpaid",
      expires_at: Math.floor((Date.now() + 6 * HOURS) / 1000),
    });

    const body = await (await GET(req())).json();
    expect(body.reconciled[0].outcome).toBe("still_open");
    expect(state.updates).toHaveLength(0);
  });

  it("recovers a missed webhook: flips to paid and runs the owed delivery", async () => {
    state.pending = [pendingRow()];
    mocks.retrieveMock.mockResolvedValue({
      id: "cs_live_abc",
      status: "complete",
      payment_status: "paid",
      amount_total: 300,
      payment_intent: "pi_live_123",
      expires_at: Math.floor((Date.now() - HOURS) / 1000),
    });

    const body = await (await GET(req())).json();
    expect(body.counts.paid_recovered).toBe(1);

    const upd = state.updates.at(0)!;
    expect(upd.patch.status).toBe("paid");
    expect(upd.patch.stripe_payment_intent).toBe("pi_live_123");
    // The honest field, from Stripe's amount_total — not our intent column.
    expect(upd.patch.paid_amount_aud_cents).toBe(300);
    expect(mocks.runGuestAnalysisMock).toHaveBeenCalledWith("row-1");
    expect(mocks.sendTelegramMock).toHaveBeenCalled();
  });

  it("does not deliver twice when the webhook wins the race", async () => {
    state.pending = [pendingRow()];
    state.updateResults = [{ data: [], error: null }];
    mocks.retrieveMock.mockResolvedValue({
      id: "cs_live_abc",
      status: "complete",
      payment_status: "paid",
      amount_total: 300,
      payment_intent: "pi_live_123",
    });

    await GET(req());
    expect(mocks.runGuestAnalysisMock).not.toHaveBeenCalled();
  });

  it("closes an aged-out row with no Stripe session as 'expired', never 'abandoned'", async () => {
    state.pending = [
      pendingRow({ stripe_session_id: null, created_at: iso(72 * HOURS) }),
    ];

    const body = await (await GET(req())).json();
    expect(body.reconciled[0].outcome).toBe("expired");
    expect(state.updates.at(0)!.patch.status).toBe("expired");
    // 'expired' rows are never emailed — we could not establish a truth.
    expect(mocks.sendRecoveryMock).not.toHaveBeenCalled();
  });

  it("keeps a young row pending when Stripe lookup fails", async () => {
    state.pending = [pendingRow({ created_at: iso(2 * HOURS) })];
    mocks.retrieveMock.mockRejectedValue(new Error("network"));

    const body = await (await GET(req())).json();
    expect(body.reconciled[0].outcome).toBe("lookup_failed");
    expect(state.updates).toHaveLength(0);
  });
});

// --- Phase 2: one recovery email, once ------------------------------------

describe("recovery email", () => {
  it("sends one email with the founder's own input and a resume link", async () => {
    state.abandoned = [abandonedRow()];

    const body = await (await GET(req())).json();
    expect(body.counts.emails_sent).toBe(1);
    expect(mocks.sendRecoveryMock).toHaveBeenCalledTimes(1);

    const arg = mocks.sendRecoveryMock.mock.calls[0][0];
    expect(arg.email).toBe("founder@example.com");
    expect(arg.inputLabel).toBe("https://example.com");
    expect(arg.resumeUrl).toBe(
      `https://blockid.au/api/guest-analysis/resume/${"a".repeat(48)}`,
    );
  });

  it("claims recovery_email_sent_at BEFORE sending", async () => {
    state.abandoned = [abandonedRow()];
    let claimedBeforeSend = false;
    mocks.sendRecoveryMock.mockImplementation(async () => {
      claimedBeforeSend = state.updates.some(
        (u) => "recovery_email_sent_at" in u.patch,
      );
      return { ok: true };
    });

    await GET(req());
    expect(claimedBeforeSend).toBe(true);
  });

  it("sends nothing when the claim matches zero rows (second run)", async () => {
    state.abandoned = [abandonedRow()];
    state.updateResults = [{ data: [], error: null }];

    const body = await (await GET(req())).json();
    expect(mocks.sendRecoveryMock).not.toHaveBeenCalled();
    expect(body.recovery[0].action).toBe("claim_lost");
  });

  it("guards the claim on recovery_email_sent_at IS NULL", async () => {
    state.abandoned = [abandonedRow()];
    await GET(req());
    const claim = state.updates.find(
      (u) => "recovery_email_sent_at" in u.patch,
    )!;
    expect(claim.filters).toContainEqual(["is", "recovery_email_sent_at", null]);
  });

  it("never emails an address that has unsubscribed", async () => {
    state.abandoned = [abandonedRow()];
    mocks.canSendEmailMock.mockResolvedValue(false);

    const body = await (await GET(req())).json();
    expect(mocks.sendRecoveryMock).not.toHaveBeenCalled();
    expect(body.recovery[0].action).toBe("suppressed");
    expect(mocks.canSendEmailMock).toHaveBeenCalledWith(
      "founder@example.com",
      "promotions",
    );
  });

  it("records a send failure without ever un-claiming it", async () => {
    state.abandoned = [abandonedRow()];
    mocks.sendRecoveryMock.mockResolvedValue({ ok: false, reason: "send_error" });

    const body = await (await GET(req())).json();
    expect(body.recovery[0].action).toBe("send_failed");
    const unclaim = state.updates.find(
      (u) => u.patch.recovery_email_sent_at === null,
    );
    expect(unclaim).toBeUndefined();
  });
});

// --- Dry run --------------------------------------------------------------

describe("dry run", () => {
  it("writes nothing and sends nothing", async () => {
    state.pending = [pendingRow()];
    state.abandoned = [abandonedRow()];
    mocks.retrieveMock.mockResolvedValue({
      id: "cs_live_abc",
      status: "expired",
      payment_status: "unpaid",
    });

    const body = await (await GET(req({ query: "?dry=1" }))).json();
    expect(body.dry).toBe(true);
    expect(state.updates).toHaveLength(0);
    expect(mocks.sendRecoveryMock).not.toHaveBeenCalled();
    expect(mocks.sendTelegramMock).not.toHaveBeenCalled();
  });
});
