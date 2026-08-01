import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Colocated vitest for the previously-untested server-only
// `referrals.ts` — the two-sided referral engine wired through signup and
// the /account referral surface. A silent regression here can either
// (a) grant credits twice for the same referred user (svi_notifications
// dedup marker skipped), (b) allow a founder to self-refer and mint free
// credits, (c) leak the promo grant amount past the 2026-08-01 deadline,
// or (d) forget to write `referred_by` — breaking the affiliate lineage
// the reseller commission report reads from. The tests pin the exact
// filter shapes, dedup markers, payload shapes, and promo-window numeric
// constants the downstream Stripe-webhook + weekly-digest callers depend
// on.
//
// The fake Supabase covers the chain shapes this module walks:
//   .from().select(cols).eq().maybeSingle()             ← getReferralCode
//                                                          + processReferral
//                                                            referrer lookup
//   .from().update(payload).eq()                        ← lazy-code update
//                                                          + counter update
//   .from().update(payload).eq().is()                   ← set referred_by
//   .from().select("id").eq().filter().limit()          ← existing-bonus
//   .from().insert(payload)                             ← notif + events
//   .from().select(col).eq().single()                   ← counter read
//   .from().select("id",{count,head}).eq()              ← stats count

interface CapturedEq {
  col: string;
  val: unknown;
}

interface CapturedFilter {
  col: string;
  op: string;
  val: unknown;
}

interface CapturedIs {
  col: string;
  val: unknown;
}

interface CapturedCall {
  table: string;
  selectCols: string | null;
  selectOpts: Record<string, unknown> | null;
  insertPayload: unknown;
  updatePayload: unknown;
  eqs: CapturedEq[];
  is: CapturedIs[];
  filters: CapturedFilter[];
  limit: number | null;
  terminal: "single" | "maybeSingle" | "await" | null;
}

interface FakeState {
  adminConfigured: boolean;
  queue: Array<{ data?: unknown; error?: unknown; count?: number | null }>;
  calls: CapturedCall[];
}

const state: FakeState = {
  adminConfigured: true,
  queue: [],
  calls: [],
};

function nextResponse(): { data: unknown; error: unknown; count: number | null } {
  const next = state.queue.shift() ?? {};
  return {
    data: next.data ?? null,
    error: next.error ?? null,
    count: next.count ?? null,
  };
}

function makeChain(table: string) {
  const op: CapturedCall = {
    table,
    selectCols: null,
    selectOpts: null,
    insertPayload: null,
    updatePayload: null,
    eqs: [],
    is: [],
    filters: [],
    limit: null,
    terminal: null,
  };
  state.calls.push(op);

  const chain: Record<string, unknown> = {};
  chain.select = (cols?: string, opts?: Record<string, unknown>) => {
    op.selectCols = cols ?? null;
    op.selectOpts = opts ?? null;
    return chain;
  };
  chain.insert = (payload: unknown) => {
    op.insertPayload = payload;
    return chain;
  };
  chain.update = (payload: unknown) => {
    op.updatePayload = payload;
    return chain;
  };
  chain.eq = (col: string, val: unknown) => {
    op.eqs.push({ col, val });
    return chain;
  };
  chain.is = (col: string, val: unknown) => {
    op.is.push({ col, val });
    return chain;
  };
  chain.filter = (col: string, opStr: string, val: unknown) => {
    op.filters.push({ col, op: opStr, val });
    return chain;
  };
  chain.limit = (n: number) => {
    op.limit = n;
    return chain;
  };
  chain.single = () => {
    op.terminal = "single";
    return Promise.resolve(nextResponse());
  };
  chain.maybeSingle = () => {
    op.terminal = "maybeSingle";
    return Promise.resolve(nextResponse());
  };
  chain.then = (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => {
    op.terminal = op.terminal ?? "await";
    return Promise.resolve(nextResponse()).then(onFulfilled, onRejected);
  };
  return chain;
}

vi.mock("server-only", () => ({}));

vi.mock("./supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.adminConfigured) return null;
    return {
      from: (table: string) => makeChain(table),
    };
  },
}));

const grantCreditsMock = vi.fn(async (..._args: unknown[]) => ({ ok: true }));
vi.mock("./credits", () => ({
  grantCredits: (...args: unknown[]) => grantCreditsMock(...args),
}));

const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

function callsFor(table: string): CapturedCall[] {
  return state.calls.filter((c) => c.table === table);
}

// Pin the system clock BEFORE any import so the module-load-time
// isPromo() branch is deterministic. Tests that want to swap the branch
// (or the non-promo branch) override the clock + reset modules locally.
const PROMO_DAY = new Date("2026-07-15T00:00:00Z");

beforeEach(() => {
  vi.resetModules();
  state.adminConfigured = true;
  state.queue = [];
  state.calls = [];
  grantCreditsMock.mockClear();
  errorSpy.mockClear();
  warnSpy.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(PROMO_DAY);
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

// ---------------------------------------------------------------------------
// getReferralUrl — pure builder
// ---------------------------------------------------------------------------

describe("referrals — getReferralUrl", () => {
  it("falls back to https://blockid.au when NEXT_PUBLIC_SITE_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const { getReferralUrl } = await import("./referrals");
    expect(getReferralUrl("abc12345")).toBe("https://blockid.au/?ref=abc12345");
  });

  it("uses NEXT_PUBLIC_SITE_URL verbatim (does NOT strip trailing slash — pins current behaviour)", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.blockid.au/";
    const { getReferralUrl } = await import("./referrals");
    // Regression guard: today's builder does not sanitise trailing slash.
    // Any future dedup must update this expectation intentionally.
    expect(getReferralUrl("code9999")).toBe(
      "https://staging.blockid.au//?ref=code9999",
    );
  });

  it("respects a custom host without trailing slash", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://preview.blockid.au";
    const { getReferralUrl } = await import("./referrals");
    expect(getReferralUrl("x")).toBe("https://preview.blockid.au/?ref=x");
  });

  it("passes the code through unencoded (natural key is 8 hex chars — no reserved URL chars)", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const { getReferralUrl } = await import("./referrals");
    expect(getReferralUrl("deadbeef")).toBe("https://blockid.au/?ref=deadbeef");
  });
});

// ---------------------------------------------------------------------------
// Promo window — the constants baked in at module load
// ---------------------------------------------------------------------------

describe("referrals — promo window", () => {
  it("during promo (before 2026-08-01 Sydney), referrer gets 5 credits + referee bonus 3", async () => {
    vi.setSystemTime(new Date("2026-07-15T00:00:00Z"));
    state.queue.push({
      data: { id: "referrer-1", email: "ref@blockid.au" },
    });
    state.queue.push({ error: null }); // update referred_by
    state.queue.push({ data: [] });    // no existing bonus
    state.queue.push({ data: { referral_credits_earned: 0 } }); // read counter
    state.queue.push({ error: null }); // update counter
    state.queue.push({ error: null }); // notif insert
    state.queue.push({ error: null }); // referral_events insert
    const { processReferral } = await import("./referrals");
    await processReferral("new-1", "code-a");
    expect(grantCreditsMock.mock.calls[0][1]).toBe(5);
    expect(grantCreditsMock.mock.calls[1][1]).toBe(3);
  });

  it("after promo (>= 2026-08-01 Sydney), referrer gets 2 credits + referee bonus 1", async () => {
    // Sydney is UTC+10 so the local Aug-1 boundary is 2026-07-31T14:00:00Z.
    vi.setSystemTime(new Date("2026-08-02T00:00:00Z"));
    state.queue.push({
      data: { id: "referrer-2", email: "ref2@blockid.au" },
    });
    state.queue.push({ error: null });
    state.queue.push({ data: [] });
    state.queue.push({ data: { referral_credits_earned: 0 } });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    const { processReferral } = await import("./referrals");
    await processReferral("new-2", "code-b");
    expect(grantCreditsMock.mock.calls[0][1]).toBe(2);
    expect(grantCreditsMock.mock.calls[1][1]).toBe(1);
  });

  it("promo constants are frozen at module load — same values across many calls in one session", async () => {
    vi.setSystemTime(new Date("2026-07-15T00:00:00Z"));
    state.queue.push({ data: { id: "r1", email: "r@x" } });
    state.queue.push({ error: null });
    state.queue.push({ data: [] });
    state.queue.push({ data: { referral_credits_earned: 0 } });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    // Even if we advance the clock past the deadline mid-session, the
    // constants captured at load time do not shift — that behaviour is
    // what makes reruns of a webhook idempotent.
    state.queue.push({ data: { id: "r1", email: "r@x" } });
    state.queue.push({ error: null });
    state.queue.push({ data: [] });
    state.queue.push({ data: { referral_credits_earned: 5 } });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    const { processReferral } = await import("./referrals");
    await processReferral("n-1", "code-x");
    vi.setSystemTime(new Date("2026-08-05T00:00:00Z"));
    await processReferral("n-2", "code-x");
    expect(grantCreditsMock.mock.calls[0][1]).toBe(5);
    expect(grantCreditsMock.mock.calls[2][1]).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// getReferralCode
// ---------------------------------------------------------------------------

describe("referrals — getReferralCode", () => {
  it("returns null when no supabase admin is configured (no throw, no DB call)", async () => {
    state.adminConfigured = false;
    const { getReferralCode } = await import("./referrals");
    const res = await getReferralCode("u-1");
    expect(res).toBeNull();
    expect(state.calls).toHaveLength(0);
  });

  it("selects the referral_code column from app_users keyed on id", async () => {
    state.queue.push({ data: { referral_code: "abcd1234" } });
    const { getReferralCode } = await import("./referrals");
    await getReferralCode("u-1");
    const [call] = callsFor("app_users");
    expect(call.selectCols).toBe("referral_code");
    expect(call.eqs).toEqual([{ col: "id", val: "u-1" }]);
    expect(call.terminal).toBe("maybeSingle");
  });

  it("returns the existing referral_code unchanged when present", async () => {
    state.queue.push({ data: { referral_code: "existing" } });
    const { getReferralCode } = await import("./referrals");
    expect(await getReferralCode("u-1")).toBe("existing");
  });

  it("lazily generates an 8-char code + writes it back when the row has no referral_code", async () => {
    state.queue.push({ data: null });     // select miss
    state.queue.push({ error: null });    // update ok
    const uuidSpy = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("deadbeef-cafe-babe-0000-111122223333");
    const { getReferralCode } = await import("./referrals");
    const code = await getReferralCode("u-2");
    expect(code).toBe("deadbeef");
    uuidSpy.mockRestore();
  });

  it("uuid generation strips hyphens BEFORE slicing to 8 chars", async () => {
    state.queue.push({ data: { referral_code: null } });
    state.queue.push({ error: null });
    // First char of UUID after hyphen strip must be preserved, not eaten.
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "1-2-3-4567890abcdef",
    );
    const { getReferralCode } = await import("./referrals");
    const code = await getReferralCode("u-3");
    expect(code).toBe("12345678");
  });

  it("writes the generated code to app_users.referral_code keyed on id", async () => {
    state.queue.push({ data: null });
    state.queue.push({ error: null });
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    );
    const { getReferralCode } = await import("./referrals");
    await getReferralCode("u-4");
    const updates = callsFor("app_users").filter((c) => c.updatePayload);
    expect(updates).toHaveLength(1);
    expect(updates[0].updatePayload).toEqual({ referral_code: "aaaaaaaa" });
    expect(updates[0].eqs).toEqual([{ col: "id", val: "u-4" }]);
  });

  it("returns null AND logs when the lazy update errors (never returns a phantom code)", async () => {
    state.queue.push({ data: null });
    state.queue.push({ error: { message: "unique_violation" } });
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "ffffffff-0000-0000-0000-000000000000",
    );
    const { getReferralCode } = await import("./referrals");
    const res = await getReferralCode("u-5");
    expect(res).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "[blockid:referrals] lazy code generation failed",
      { message: "unique_violation" },
    );
  });

  it("does NOT attempt an update when the existing referral_code is present", async () => {
    state.queue.push({ data: { referral_code: "already" } });
    const { getReferralCode } = await import("./referrals");
    await getReferralCode("u-6");
    // Only the initial select — no update chain built.
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].updatePayload).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// processReferral
// ---------------------------------------------------------------------------

describe("referrals — processReferral", () => {
  it("returns {ok:false} + performs no DB work when no admin is configured", async () => {
    state.adminConfigured = false;
    const { processReferral } = await import("./referrals");
    const res = await processReferral("new-1", "code-1");
    expect(res).toEqual({ ok: false });
    expect(state.calls).toHaveLength(0);
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("returns {ok:false} when the referral code does not resolve to any referrer", async () => {
    state.queue.push({ data: null }); // referrer lookup miss
    const { processReferral } = await import("./referrals");
    const res = await processReferral("new-1", "does-not-exist");
    expect(res).toEqual({ ok: false });
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("referrer lookup selects (id, email) from app_users keyed on referral_code", async () => {
    state.queue.push({ data: null });
    const { processReferral } = await import("./referrals");
    await processReferral("new-1", "code-99");
    const [call] = state.calls;
    expect(call.table).toBe("app_users");
    expect(call.selectCols).toBe("id, email");
    expect(call.eqs).toEqual([{ col: "referral_code", val: "code-99" }]);
    expect(call.terminal).toBe("maybeSingle");
  });

  it("rejects self-referral (referrer.id === newUserId) with {ok:false}", async () => {
    state.queue.push({ data: { id: "u-1", email: "u1@x" } });
    const { processReferral } = await import("./referrals");
    const res = await processReferral("u-1", "code-self");
    expect(res).toEqual({ ok: false });
    // No downstream DB writes and no credit grants past the referrer lookup.
    expect(state.calls).toHaveLength(1);
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("guards referred_by write with .is('referred_by', null) so the field is set exactly once", async () => {
    state.queue.push({ data: { id: "r-1", email: "r@x" } });
    state.queue.push({ error: null });
    state.queue.push({ data: [] });
    state.queue.push({ data: { referral_credits_earned: 0 } });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    const { processReferral } = await import("./referrals");
    await processReferral("new-9", "code-9");
    const updateCall = callsFor("app_users").find(
      (c) => c.updatePayload && (c.updatePayload as Record<string, unknown>).referred_by,
    );
    expect(updateCall?.updatePayload).toEqual({ referred_by: "r-1" });
    expect(updateCall?.eqs).toEqual([{ col: "id", val: "new-9" }]);
    expect(updateCall?.is).toEqual([{ col: "referred_by", val: null }]);
  });

  it("returns {ok:false} + logs when the referred_by update errors", async () => {
    state.queue.push({ data: { id: "r-1", email: "r@x" } });
    state.queue.push({ error: { message: "fk_violation" } });
    const { processReferral } = await import("./referrals");
    const res = await processReferral("new-1", "code-1");
    expect(res).toEqual({ ok: false });
    expect(errorSpy).toHaveBeenCalledWith(
      "[blockid:referrals] set referred_by failed",
      { message: "fk_violation" },
    );
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("existing-bonus lookup filters svi_notifications by referral_bonus_given + payload->>referred_user_id + limit 1", async () => {
    state.queue.push({ data: { id: "r-1", email: "r@x" } });
    state.queue.push({ error: null });
    state.queue.push({ data: [{ id: "existing" }] }); // bonus exists
    const { processReferral } = await import("./referrals");
    await processReferral("new-7", "code-7");
    const bonusLookup = callsFor("svi_notifications").find((c) => c.limit === 1);
    expect(bonusLookup?.selectCols).toBe("id");
    expect(bonusLookup?.eqs).toEqual([
      { col: "notification_type", val: "referral_bonus_given" },
    ]);
    expect(bonusLookup?.filters).toEqual([
      { col: "payload->>referred_user_id", op: "eq", val: "new-7" },
    ]);
    expect(bonusLookup?.limit).toBe(1);
  });

  it("existing-bonus short-circuit returns {ok:true, referrerEmail} but does NOT grant credits or insert further rows", async () => {
    state.queue.push({ data: { id: "r-1", email: "already-paid@x" } });
    state.queue.push({ error: null });
    state.queue.push({ data: [{ id: "prev" }] });
    const { processReferral } = await import("./referrals");
    const res = await processReferral("new-1", "code-1");
    expect(res).toEqual({ ok: true, referrerEmail: "already-paid@x" });
    expect(grantCreditsMock).not.toHaveBeenCalled();
    // No further inserts fired.
    expect(callsFor("referral_events")).toHaveLength(0);
    expect(callsFor("svi_notifications").filter((c) => c.insertPayload)).toHaveLength(0);
  });

  it("happy path grants credits to BOTH sides in the promo amounts (5 referrer / 3 referee)", async () => {
    state.queue.push({ data: { id: "r-1", email: "r@x" } });
    state.queue.push({ error: null });
    state.queue.push({ data: [] });
    state.queue.push({ data: { referral_credits_earned: 0 } });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    const { processReferral } = await import("./referrals");
    await processReferral("new-1", "code-1");
    expect(grantCreditsMock).toHaveBeenCalledTimes(2);
    expect(grantCreditsMock.mock.calls[0]).toEqual([
      "r-1",
      5,
      "referral_bonus",
      { referred_user_id: "new-1" },
    ]);
    expect(grantCreditsMock.mock.calls[1]).toEqual([
      "new-1",
      3,
      "referee_welcome_bonus",
      { referrer_id: "r-1", referral_code: "code-1" },
    ]);
  });

  it("counter update reads the existing referral_credits_earned + adds REFERRER_CREDITS (5 promo)", async () => {
    state.queue.push({ data: { id: "r-2", email: "r2@x" } });
    state.queue.push({ error: null });
    state.queue.push({ data: [] });
    state.queue.push({ data: { referral_credits_earned: 10 } });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    const { processReferral } = await import("./referrals");
    await processReferral("new-2", "code-2");
    const counterUpdate = callsFor("app_users").find(
      (c) =>
        c.updatePayload &&
        (c.updatePayload as Record<string, unknown>).referral_credits_earned !== undefined,
    );
    expect(counterUpdate?.updatePayload).toEqual({
      referral_credits_earned: 15,
    });
    expect(counterUpdate?.eqs).toEqual([{ col: "id", val: "r-2" }]);
  });

  it("counter update treats null/undefined referral_credits_earned as 0 + adds REFERRER_CREDITS", async () => {
    state.queue.push({ data: { id: "r-3", email: "r3@x" } });
    state.queue.push({ error: null });
    state.queue.push({ data: [] });
    state.queue.push({ data: null }); // no counter row / null value
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    const { processReferral } = await import("./referrals");
    await processReferral("new-3", "code-3");
    const counterUpdate = callsFor("app_users").find(
      (c) =>
        c.updatePayload &&
        (c.updatePayload as Record<string, unknown>).referral_credits_earned !== undefined,
    );
    expect(counterUpdate?.updatePayload).toEqual({
      referral_credits_earned: 5,
    });
  });

  it("dedup marker inserted into svi_notifications carries type/subject + full 4-field payload", async () => {
    state.queue.push({ data: { id: "r-1", email: "r@x" } });
    state.queue.push({ error: null });
    state.queue.push({ data: [] });
    state.queue.push({ data: { referral_credits_earned: 0 } });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    const { processReferral } = await import("./referrals");
    await processReferral("new-1", "code-1");
    const marker = callsFor("svi_notifications").find((c) => c.insertPayload);
    expect(marker?.insertPayload).toEqual({
      notification_type: "referral_bonus_given",
      subject: "Referral bonus granted (2-sided)",
      payload: {
        referrer_id: "r-1",
        referred_user_id: "new-1",
        referrer_credits: 5,
        referee_credits: 3,
      },
    });
  });

  it("referral_events insert carries referrer_id/referred_id/credits_awarded (=REFERRER_CREDITS, not the referee bonus)", async () => {
    state.queue.push({ data: { id: "r-1", email: "r@x" } });
    state.queue.push({ error: null });
    state.queue.push({ data: [] });
    state.queue.push({ data: { referral_credits_earned: 0 } });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    const { processReferral } = await import("./referrals");
    await processReferral("new-1", "code-1");
    const events = callsFor("referral_events").find((c) => c.insertPayload);
    expect(events?.insertPayload).toEqual({
      referrer_id: "r-1",
      referred_id: "new-1",
      credits_awarded: 5,
    });
  });

  it("referral_events unique-violation is downgraded to a warn — still returns {ok:true, referrerEmail}", async () => {
    state.queue.push({ data: { id: "r-1", email: "r@x" } });
    state.queue.push({ error: null });
    state.queue.push({ data: [] });
    state.queue.push({ data: { referral_credits_earned: 0 } });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    state.queue.push({ error: { message: "duplicate key value" } });
    const { processReferral } = await import("./referrals");
    const res = await processReferral("new-1", "code-1");
    expect(res).toEqual({ ok: true, referrerEmail: "r@x" });
    expect(warnSpy).toHaveBeenCalledWith(
      "[blockid:referrals] referral_events insert",
      "duplicate key value",
    );
  });

  it("returns the referrer's email on happy path so the caller can trigger a thank-you flow", async () => {
    state.queue.push({ data: { id: "r-9", email: "champion@blockid.au" } });
    state.queue.push({ error: null });
    state.queue.push({ data: [] });
    state.queue.push({ data: { referral_credits_earned: 3 } });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    const { processReferral } = await import("./referrals");
    const res = await processReferral("new-1", "code-1");
    expect(res).toEqual({ ok: true, referrerEmail: "champion@blockid.au" });
  });

  it("counter read filters by the referrer id, not the new-user id (regression guard: swapping the two silently caps the referrer at 0)", async () => {
    state.queue.push({ data: { id: "r-42", email: "r42@x" } });
    state.queue.push({ error: null });
    state.queue.push({ data: [] });
    state.queue.push({ data: { referral_credits_earned: 100 } });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    const { processReferral } = await import("./referrals");
    await processReferral("new-1", "code-1");
    const counterRead = callsFor("app_users").find(
      (c) => c.terminal === "single" && c.selectCols === "referral_credits_earned",
    );
    expect(counterRead?.eqs).toEqual([{ col: "id", val: "r-42" }]);
  });

  it("in the promo window, marker payload records referrer_credits=5 + referee_credits=3 (auditable)", async () => {
    state.queue.push({ data: { id: "r-1", email: "r@x" } });
    state.queue.push({ error: null });
    state.queue.push({ data: [] });
    state.queue.push({ data: { referral_credits_earned: 0 } });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    state.queue.push({ error: null });
    const { processReferral } = await import("./referrals");
    await processReferral("new-1", "code-1");
    const marker = callsFor("svi_notifications").find((c) => c.insertPayload);
    const payload = (marker?.insertPayload as { payload: Record<string, number> })
      .payload;
    expect(payload.referrer_credits).toBe(5);
    expect(payload.referee_credits).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// getReferralStats
// ---------------------------------------------------------------------------

describe("referrals — getReferralStats", () => {
  it("returns empty stats (code:'', url:'', totalReferred:0, creditsEarned:0) when no admin is configured", async () => {
    state.adminConfigured = false;
    const { getReferralStats } = await import("./referrals");
    const res = await getReferralStats("u-1");
    expect(res).toEqual({ code: "", url: "", totalReferred: 0, creditsEarned: 0 });
  });

  it("returns full stats on happy path (existing code + earned counter + event count)", async () => {
    state.queue.push({ data: { referral_code: "abcd1234" } });  // getReferralCode
    state.queue.push({ data: { referral_credits_earned: 20 } }); // app_users read
    state.queue.push({ count: 7 });                              // referral_events count
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const { getReferralStats } = await import("./referrals");
    const res = await getReferralStats("u-1");
    expect(res).toEqual({
      code: "abcd1234",
      url: "https://blockid.au/?ref=abcd1234",
      totalReferred: 7,
      creditsEarned: 20,
    });
  });

  it("defaults creditsEarned to 0 when the app_users row is null", async () => {
    state.queue.push({ data: { referral_code: "abcd1234" } });
    state.queue.push({ data: null }); // no counter row
    state.queue.push({ count: 3 });
    const { getReferralStats } = await import("./referrals");
    const res = await getReferralStats("u-2");
    expect(res.creditsEarned).toBe(0);
    expect(res.totalReferred).toBe(3);
  });

  it("defaults totalReferred to 0 when count is null (e.g. head:true with no matching rows)", async () => {
    state.queue.push({ data: { referral_code: "code9999" } });
    state.queue.push({ data: { referral_credits_earned: 4 } });
    state.queue.push({ count: null });
    const { getReferralStats } = await import("./referrals");
    const res = await getReferralStats("u-3");
    expect(res.totalReferred).toBe(0);
    expect(res.creditsEarned).toBe(4);
  });

  it("returns {code:'', url:''} when getReferralCode returns null after a failed lazy insert", async () => {
    // First queued response: getReferralCode select miss.
    state.queue.push({ data: null });
    // Second queued response: lazy update fails → getReferralCode returns null.
    state.queue.push({ error: { message: "bad" } });
    // Third+fourth: stats reads still fire because admin is present.
    state.queue.push({ data: { referral_credits_earned: 2 } });
    state.queue.push({ count: 1 });
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    );
    const { getReferralStats } = await import("./referrals");
    const res = await getReferralStats("u-4");
    expect(res.code).toBe("");
    expect(res.url).toBe("");
    expect(res.totalReferred).toBe(1);
    expect(res.creditsEarned).toBe(2);
  });

  it("referral_events count uses head:true + count:'exact' so no row payload is transferred", async () => {
    state.queue.push({ data: { referral_code: "abc00000" } });
    state.queue.push({ data: { referral_credits_earned: 0 } });
    state.queue.push({ count: 0 });
    const { getReferralStats } = await import("./referrals");
    await getReferralStats("u-5");
    const eventsCall = callsFor("referral_events")[0];
    expect(eventsCall.selectCols).toBe("id");
    expect(eventsCall.selectOpts).toEqual({ count: "exact", head: true });
    expect(eventsCall.eqs).toEqual([{ col: "referrer_id", val: "u-5" }]);
  });

  it("app_users counter read filters by the passed userId (not the referral_code)", async () => {
    state.queue.push({ data: { referral_code: "codezzzz" } });
    state.queue.push({ data: { referral_credits_earned: 42 } });
    state.queue.push({ count: 2 });
    const { getReferralStats } = await import("./referrals");
    await getReferralStats("caller-id-1");
    const counterRead = callsFor("app_users").find(
      (c) => c.terminal === "single" && c.selectCols === "referral_credits_earned",
    );
    expect(counterRead?.eqs).toEqual([{ col: "id", val: "caller-id-1" }]);
  });

  it("URL is stripped-blank when code is missing (no /?ref= dangling suffix)", async () => {
    state.adminConfigured = false;
    const { getReferralStats } = await import("./referrals");
    const res = await getReferralStats("u-1");
    expect(res.url).toBe("");
    // Regression guard: the caller renders the URL in a copy-to-clipboard —
    // '/' or '/?ref=' would silently point to the homepage without an attributable code.
    expect(res.url).not.toContain("?ref=");
  });
});
